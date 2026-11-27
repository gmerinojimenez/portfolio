/**
 * The chat's AI steps as a LangGraph graph (S18, ADR 0016):
 *
 *   START -> gate -+- answered by the gate (enforce + reject) ----------> END
 *                  +- otherwise -> budget -+- no budget ---------------> END
 *                                          +- answer -> finish ---------> END
 *
 * Each node is one call to a step of chat-steps.ts, the same code the direct
 * orchestrator runs. Wire events go out through the `custom` stream mode
 * (`config.writer`), so the handler gets the same NDJSON as with `direct`.
 *
 * No checkpointer: every question is a fresh run. The conversation comes from
 * the browser, as before. The state is what a trace shows, so it never holds
 * the IP, its hash or the Turnstile token.
 */
import {
  Annotation,
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from '@langchain/langgraph';
import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { ChatOrchestrator, ChatRun } from './chat-orchestrator';
import {
  finishAnswer,
  reserveBudget,
  runGate,
  streamAnswer,
  type AnswerResult,
  type Emit,
  type GateLog,
  type ModelCall,
  type RequestInfo,
  type StepDeps,
} from './chat-steps';
import type { WireEvent } from './messages';
import type { Reservation } from './spend-brake';

const ChatState = Annotation.Root({
  req: Annotation<RequestInfo>(),
  call: Annotation<ModelCall>(),
  gateLog: Annotation<GateLog>(),
  /** The gate answered the question itself. */
  stopped: Annotation<boolean>(),
  reservation: Annotation<Reservation | null>(),
  result: Annotation<AnswerResult>(),
});
type State = typeof ChatState.State;

/** The node's emitter: the stream writer, present in `custom` mode. */
function emitter(config: LangGraphRunnableConfig): Emit {
  const writer = config.writer;
  if (!writer) throw new Error('chat graph must run in custom stream mode');
  return (event: WireEvent) => writer(event);
}

export function buildChatGraph(deps: StepDeps) {
  return new StateGraph(ChatState)
    .addNode('gate', async (state: State, config) => {
      const { gateLog, stopped } = await runGate(
        deps,
        state.req,
        state.call,
        emitter(config),
      );
      return { gateLog, stopped };
    })
    .addNode('budget', async (state: State, config) => ({
      reservation: await reserveBudget(
        deps,
        state.req,
        state.call,
        state.gateLog,
        emitter(config),
      ),
    }))
    .addNode('answer', async (state: State, config) => ({
      result: await streamAnswer(deps, state.req, state.call, emitter(config)),
    }))
    .addNode('finish', async (state: State, config) => {
      // `budget` only routes here with a reservation.
      await finishAnswer(
        deps,
        state.req,
        state.call,
        state.reservation!,
        state.result,
        state.gateLog,
        emitter(config),
      );
      return {};
    })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', (state: State) =>
      state.stopped ? END : 'budget',
    )
    .addConditionalEdges('budget', (state: State) =>
      state.reservation ? 'answer' : END,
    )
    .addEdge('answer', 'finish')
    .addEdge('finish', END)
    .compile();
}

/** LangSmith tracing of each run (chat-tracing.ts). */
export interface GraphTracing {
  callbacks: () => Callbacks;
  /** Sends the pending traces; never throws. */
  flush: () => Promise<void>;
}

export class LangGraphOrchestrator implements ChatOrchestrator {
  readonly name = 'langgraph';
  private readonly graph;

  constructor(
    private readonly deps: StepDeps,
    private readonly tracing?: GraphTracing,
  ) {
    // Compiled once per container, not per request.
    this.graph = buildChatGraph(deps);
  }

  async run({ req, call }: ChatRun, emit: Emit): Promise<void> {
    try {
      const stream = await this.graph.stream(
        { req, call, gateLog: {}, stopped: false, reservation: null },
        {
          streamMode: 'custom',
          runName: 'chat',
          tags: [req.locale, `gate:${this.deps.gateMode}`],
          metadata: { requestId: req.requestId, turn: req.turn },
          ...(this.tracing ? { callbacks: this.tracing.callbacks() } : {}),
        },
      );
      for await (const event of stream) emit(event as WireEvent);
    } finally {
      // After the response has ended: never delays the visitor.
      if (this.tracing) await this.tracing.flush();
    }
  }
}
