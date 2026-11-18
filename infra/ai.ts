import type { AiConfig } from './ai-config';

/**
 * AI backend (S09): a streaming Lambda behind a Function URL, one DynamoDB
 * table (spend brake, per-IP limits, question log) and three SST secrets.
 *
 * Set the secrets once per stage before deploying:
 *   pnpm exec sst secret set AnthropicApiKey <key> --stage <stage>
 *   pnpm exec sst secret set TurnstileSecret <secret> --stage <stage>
 *   pnpm exec sst secret set IpHashSalt "$(openssl rand -hex 32)" --stage <stage>
 *
 * `contextDir` holds context.json, generated from src/content right before
 * this runs (see sst.config.ts); it is copied next to the handler.
 */
export function createAi(config: AiConfig, contextDir: string) {
  const anthropicApiKey = new sst.Secret('AnthropicApiKey');
  const turnstileSecret = new sst.Secret('TurnstileSecret');
  const ipHashSalt = new sst.Secret('IpHashSalt');

  const table = new sst.aws.Dynamo('AiTable', {
    fields: { pk: 'string', sk: 'string' },
    primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
    // Counters and logs expire on their own (epoch seconds).
    ttl: 'expiresAt',
  });

  const { allowedOrigins } = config;

  const fn = new sst.aws.Function('AiAnswer', {
    handler: 'src/server/ai/lambda.handler',
    runtime: 'nodejs24.x',
    architecture: 'arm64',
    memory: '512 MB',
    timeout: '60 seconds',
    streaming: true,
    // Only the secrets are linked: linking the table would grant
    // dynamodb:* on it, so its access is declared by hand below.
    link: [anthropicApiKey, turnstileSecret, ipHashSalt],
    permissions: [
      {
        actions: ['dynamodb:UpdateItem', 'dynamodb:PutItem'],
        resources: [table.arn],
      },
    ],
    environment: {
      AI_TABLE_NAME: table.name,
      AI_ALLOWED_ORIGINS: allowedOrigins.join(','),
      AI_DAILY_LIMIT_USD: String(config.dailyLimitUsd),
    },
    copyFiles: [{ from: contextDir, to: 'ai-context' }],
    logging: { retention: '1 month' },
    url: {
      cors: {
        // Without configured origins nothing is allowed (the handler also
        // rejects every request), rather than falling back to "*".
        allowOrigins: allowedOrigins.length
          ? allowedOrigins
          : ['https://invalid.invalid'],
        allowMethods: ['POST'],
        allowHeaders: ['content-type'],
        maxAge: '1 day',
      },
    },
  });

  return { url: fn.url };
}
