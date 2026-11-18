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
 * Secrets come from SST links: AnthropicApiKey, TurnstileSecret, IpHashSalt.
 */
import { join } from 'node:path';
import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import { AnthropicProvider } from './anthropic-provider';
import { CONTEXT_FILE_NAME, loadAiContext } from './context';
import {
  createAiHandler,
  type HttpRequest,
  type ResponseSink,
} from './handler';
import { hashIp } from './ip-hash';
import { NDJSON, errorEvent, line } from './messages';
import { usdToMicroUsd } from './pricing';
import { RateLimiter } from './rate-limit';
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
  const contextPath =
    process.env.AI_CONTEXT_PATH ??
    join(
      process.env.LAMBDA_TASK_ROOT ?? process.cwd(),
      'ai-context',
      CONTEXT_FILE_NAME,
    );

  cached = createAiHandler({
    provider: new AnthropicProvider({ apiKey: secret('AnthropicApiKey') }),
    brake: new SpendBrake(store, usdToMicroUsd(limitUsd)),
    rateLimiter: new RateLimiter(store),
    log: store,
    verifyTurnstile: createTurnstileVerifier(
      secret('TurnstileSecret'),
      allowedOrigins.map((origin) => new URL(origin).hostname),
    ),
    hashIp: (ip) => hashIp(ip, salt),
    context: loadAiContext(contextPath),
    allowedOrigins,
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
