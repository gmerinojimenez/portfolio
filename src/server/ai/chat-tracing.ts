/**
 * LangSmith tracing of the chat graph (S18, ADR 0016). EU region only, with
 * an explicit client: nothing is traced through global environment variables.
 *
 * - The content document (the whole corpus, ~15k tokens, public and the same
 *   on every call) is replaced by its length in inputs and outputs.
 * - The graph state never holds the IP, its hash or the Turnstile token.
 * - Traces are sent after the response has ended, with a time cap. A LangSmith
 *   failure is logged and ignored: it never changes an answer.
 */
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Client } from 'langsmith';
import type { GraphTracing } from './chat-graph';

export const LANGSMITH_EU_API_URL = 'https://eu.api.smith.langchain.com';
export const PRODUCTION_PROJECT = 'portfolio-production';
export const EVAL_PROJECT = 'portfolio-eval';
/** Longest wait for pending traces after a response. */
export const FLUSH_TIMEOUT_MS = 2_000;

const CONTEXT_MARKER = '<portfolio_content';

/** Replaces every copy of the content document with its length. */
export function hideContext<T>(value: T): T {
  if (typeof value === 'string') {
    return (
      value.startsWith(CONTEXT_MARKER)
        ? `[context: ${value.length} chars]`
        : value
    ) as T;
  }
  if (Array.isArray(value)) return value.map(hideContext) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, hideContext(item)]),
    ) as T;
  }
  return value;
}

export interface TracingOptions {
  apiKey: string;
  projectName: string;
  apiUrl?: string;
  flushTimeoutMs?: number;
  /** Tests: send each run as its own JSON request instead of batches. */
  autoBatchTracing?: boolean;
  logger?: (record: Record<string, unknown>) => void;
}

export interface ChatTracing extends GraphTracing {
  /** The LangSmith client, for wrapAnthropic. */
  client: Client;
  projectName: string;
}

export function createTracing(options: TracingOptions): ChatTracing {
  const logger =
    options.logger ?? ((record) => console.log(JSON.stringify(record)));
  const timeoutMs = options.flushTimeoutMs ?? FLUSH_TIMEOUT_MS;
  const client = new Client({
    apiUrl: options.apiUrl ?? LANGSMITH_EU_API_URL,
    apiKey: options.apiKey,
    hideInputs: (inputs) => hideContext(inputs),
    hideOutputs: (outputs) => hideContext(outputs),
    ...(options.autoBatchTracing === false ? { autoBatchTracing: false } : {}),
  });
  return {
    client,
    projectName: options.projectName,
    // A tracer per run: it keeps the run tree of one request.
    callbacks: () => [
      new LangChainTracer({ client, projectName: options.projectName }),
    ],
    flush: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      });
      try {
        const outcome = await Promise.race([
          client.awaitPendingTraceBatches().then(() => 'sent' as const),
          timeout,
        ]);
        if (outcome === 'timeout') {
          logger({ warning: 'langsmith flush timed out', timeoutMs });
        }
      } catch (error) {
        logger({ warning: 'langsmith flush failed', error: String(error) });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
