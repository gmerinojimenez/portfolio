/**
 * Who chains the AI steps of a request (S18, ADR 0016). The handler does the
 * HTTP and abuse checks, then hands the request to an orchestrator.
 *
 * - `direct`: calls the steps in sequence. Also used for job offers.
 * - `langgraph` (chat-graph.ts): runs them as the nodes of a LangGraph graph,
 *   optionally traced with LangSmith.
 */
import {
  finishAnswer,
  reserveBudget,
  runGate,
  streamAnswer,
  type Emit,
  type ModelCall,
  type RequestInfo,
  type StepDeps,
} from './chat-steps';

export const ORCHESTRATORS = ['direct', 'langgraph'] as const;
export type OrchestratorName = (typeof ORCHESTRATORS)[number];

export interface ChatRun {
  req: RequestInfo;
  call: ModelCall;
}

export interface ChatOrchestrator {
  readonly name: OrchestratorName;
  run(input: ChatRun, emit: Emit): Promise<void>;
}

export class DirectOrchestrator implements ChatOrchestrator {
  readonly name = 'direct';

  constructor(private readonly deps: StepDeps) {}

  async run({ req, call }: ChatRun, emit: Emit): Promise<void> {
    const { deps } = this;
    const gate = await runGate(deps, req, call, emit);
    if (gate.stopped) return;
    const reservation = await reserveBudget(
      deps,
      req,
      call,
      gate.gateLog,
      emit,
    );
    if (!reservation) return;
    const result = await streamAnswer(deps, req, call, emit);
    await finishAnswer(
      deps,
      req,
      call,
      reservation,
      result,
      gate.gateLog,
      emit,
    );
  }
}
