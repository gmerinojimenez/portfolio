/**
 * Lambda entry point (Function URL with RESPONSE_STREAM, see infra/ai.ts).
 * Wires the real dependencies into the pure handler. Everything heavy is
 * created once per container and reused across invocations.
 *
 * Environment (set by infra/ai.ts):
 *   AI_TABLE_NAME          DynamoDB table
 *   AI_ALLOWED_ORIGINS     comma-separated exact origins
 *   AI_DAILY_LIMIT_USD     spend brake limit
 *   AI_CONTEXT_PATH        optional; defaults to <task root>/ai-context/context.json
 *   AI_SCOPE_GATE          off (default), shadow or enforce (S17)
 *   AI_ORCHESTRATOR        direct (default) or langgraph (S18)
 *   AI_TRACING             "true": LangSmith tracing of the graph (S18)
 * Secrets come from SST links: AnthropicApiKey, TurnstileSecret, IpHashSalt,
 * TypeSafeApiKey when the scope gate runs and LangSmithApiKey when tracing.
 */
import { join } from 'node:path';
import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import { wrapAnthropic } from 'langsmith/wrappers/anthropic';
import { AnthropicProvider } from './anthropic-provider';
import { LangGraphOrchestrator } from './chat-graph';
import { ORCHESTRATORS, type OrchestratorName } from './chat-orchestrator';
import { PRODUCTION_PROJECT, createTracing } from './chat-tracing';
import { CONTEXT_FILE_NAME, loadAiContext } from './context';
import {
  createAiHandler,
  type HttpRequest,
  type ResponseSink,
} from './handler';
import { hashIp } from './ip-hash';
import { JevScopeGate, createJevClient } from './jev-scope-gate';
import { NDJSON, errorEvent, line } from './messages';
import { usdToMicroUsd } from './pricing';
import { OFFER_RATE_LIMITS, RateLimiter } from './rate-limit';
import { SCOPE_GATE_MODES, type ScopeGateMode } from './scope-gate';
import { SpendBrake } from './spend-brake';
import { DynamoStore } from './store-dynamo';
import { createTurnstileVerifier } from './turnstile';

export const DEFAULT_DAILY_LIMIT_USD = 0.5;

function secret(name: string): string {
  const linked = (Resource as unknown as Record<string, { value?: string }>)[
    name
  ];
  if (!linked?.value) throw new Error(`Secret ${name} is not linked or empty`);
  return linked.value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

let cached: ReturnType<typeof createAiHandler> | undefined;

function getHandler() {
  if (cached) return cached;
  const allowedOrigins = parseOrigins(process.env.AI_ALLOWED_ORIGINS);
  const limitUsd = Number(
    process.env.AI_DAILY_LIMIT_USD ?? DEFAULT_DAILY_LIMIT_USD,
  );
  if (!Number.isFinite(limitUsd) || limitUsd < 0) {
    throw new Error('AI_DAILY_LIMIT_USD must be a non-negative number');
  }
  const store = new DynamoStore(
    DynamoDBDocumentClient.from(new DynamoDBClient({})),
    required('AI_TABLE_NAME'),
  );
  const salt = secret('IpHashSalt');
  const gateMode = (process.env.AI_SCOPE_GATE ?? 'off') as ScopeGateMode;
  if (!SCOPE_GATE_MODES.includes(gateMode)) {
    throw new Error(
      `AI_SCOPE_GATE must be one of ${SCOPE_GATE_MODES.join(', ')}`,
    );
  }
  const orchestrator = (process.env.AI_ORCHESTRATOR ??
    'direct') as OrchestratorName;
  if (!ORCHESTRATORS.includes(orchestrator)) {
    throw new Error(
      `AI_ORCHESTRATOR must be one of ${ORCHESTRATORS.join(', ')}`,
    );
  }
  // Only the graph is traced (infra/ai-config.ts enforces it at deploy).
  const tracing =
    orchestrator === 'langgraph' && process.env.AI_TRACING === 'true'
      ? createTracing({
          apiKey: secret('LangSmithApiKey'),
          projectName: PRODUCTION_PROJECT,
        })
      : undefined;
  const contextPath =
    process.env.AI_CONTEXT_PATH ??
    join(
      process.env.LAMBDA_TASK_ROOT ?? process.cwd(),
      'ai-context',
      CONTEXT_FILE_NAME,
    );

  cached = createAiHandler({
    provider: new AnthropicProvider({
      apiKey: secret('AnthropicApiKey'),
      // The model call shows up as an LLM span under the graph's `answer`
      // node. Outside a traced run (job offers) nothing is sent.
      ...(tracing ? { wrapClient: (client) => wrapAnthropic(client) } : {}),
    }),
    brake: new SpendBrake(store, usdToMicroUsd(limitUsd)),
    rateLimiter: new RateLimiter(store),
    offerRateLimiter: new RateLimiter(store, OFFER_RATE_LIMITS, 'offer-rate'),
    log: store,
    verifyTurnstile: createTurnstileVerifier(
      secret('TurnstileSecret'),
      allowedOrigins.map((origin) => new URL(origin).hostname),
    ),
    hashIp: (ip) => hashIp(ip, salt),
    context: loadAiContext(contextPath),
    ...(gateMode === 'off'
      ? {}
      : {
          scopeGate: new JevScopeGate(
            createJevClient(secret('TypeSafeApiKey')),
          ),
          scopeGateMode: gateMode,
        }),
    allowedOrigins,
    ...(orchestrator === 'langgraph'
      ? {
          createChatOrchestrator: (steps) =>
            new LangGraphOrchestrator(steps, tracing),
        }
      : {}),
  });
  return cached;
}

export function toHttpRequest(event: LambdaFunctionURLEvent): HttpRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  const raw = event.body ?? '';
  return {
    method: event.requestContext.http.method,
    headers,
    body: event.isBase64Encoded
      ? Buffer.from(raw, 'base64').toString('utf8')
      : raw,
    sourceIp: event.requestContext.http.sourceIp,
  };
}

export const handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream) => {
    let stream: NodeJS.WritableStream = responseStream;
    const sink: ResponseSink = {
      start(statusCode, headers) {
        stream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode,
          headers,
        });
      },
      write(chunk) {
        stream.write(chunk);
      },
      end() {
        stream.end();
      },
    };
    let handle;
    try {
      handle = getHandler();
    } catch (error) {
      // Misconfiguration (missing secret, context file...): answer, don't hang.
      console.error(
        JSON.stringify({ outcome: 'config_error', error: String(error) }),
      );
      sink.start(500, { 'content-type': NDJSON, 'cache-control': 'no-store' });
      sink.write(line(errorEvent('unavailable', 'es')));
      sink.end();
      return;
    }
    await handle(toHttpRequest(event), sink);
  },
);
