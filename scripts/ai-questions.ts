/**
 * Lists the questions visitors asked the AI, from the production question
 * log in DynamoDB (kept 90 days, no IP). Needs an AWS session:
 * `aws login --profile gmj`.
 *
 *   pnpm ai:questions             last 7 days, answers shortened
 *   pnpm ai:questions --days 30   last 30 days (max 90)
 *   pnpm ai:questions --full      full answers
 */
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type { QuestionLogEntry } from '../src/server/ai/store';
import { formatEntries, logPartitions, parseArgs } from './lib/question-log';

const TABLE_PREFIX = 'portfolio-production-AiTable';
const region = process.env.PORTFOLIO_AWS_REGION ?? 'eu-north-1';

async function findTable(client: DynamoDBClient): Promise<string> {
  const { TableNames = [] } = await client.send(new ListTablesCommand({}));
  const table = TableNames.find((name) => name.startsWith(TABLE_PREFIX));
  if (!table)
    throw new Error(`No DynamoDB table starting with ${TABLE_PREFIX}`);
  return table;
}

async function main(): Promise<void> {
  const { days, full } = parseArgs(process.argv.slice(2));
  const client = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(client);
  const table = await findTable(client);

  const entries: QuestionLogEntry[] = [];
  for (const pk of logPartitions(days, new Date())) {
    let start: QueryCommandOutput['LastEvaluatedKey'];
    do {
      const page = await doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ExclusiveStartKey: start,
        }),
      );
      entries.push(...((page.Items ?? []) as QuestionLogEntry[]));
      start = page.LastEvaluatedKey;
    } while (start);
  }

  console.log(formatEntries(entries, { full }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
