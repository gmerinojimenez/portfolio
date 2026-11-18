/**
 * DynamoDB implementation of the storage seam. One table, keyed by `pk`
 * (string) + `sk` (string), with TTL on `expiresAt` (epoch seconds):
 *
 *   spend#2026-11-18        / counter     daily spend brake
 *   rate#<ipHash>#m#<min>   / counter     per-IP minute window
 *   rate#<ipHash>#d#<day>   / counter     per-IP day window
 *   log#2026-11-18          / <iso>#<id>  question log (S12 queries by day)
 *
 * Every counter change is a single UpdateItem, which DynamoDB applies
 * atomically: the condition and the addition cannot interleave with another
 * request. That is what makes the brake safe under concurrency.
 */
import {
  PutCommand,
  UpdateCommand,
  type PutCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { CounterStore, QuestionLog, QuestionLogEntry } from './store';

export const COUNTER_SK = 'counter';

/** The subset of DynamoDBDocumentClient we use (easy to fake in tests). */
export interface DocumentSender {
  send(command: UpdateCommand | PutCommand): Promise<unknown>;
}

const isConditionalFailure = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ConditionalCheckFailedException';

export class DynamoStore implements CounterStore, QuestionLog {
  constructor(
    private readonly client: DocumentSender,
    private readonly tableName: string,
  ) {}

  async addIfWithin(
    key: string,
    field: string,
    amount: number,
    max: number,
    expiresAt: number,
  ): Promise<number | null> {
    // A missing attribute would pass the condition, so check this up front.
    if (amount > max) return null;
    const input: UpdateCommandInput = {
      TableName: this.tableName,
      Key: { pk: key, sk: COUNTER_SK },
      UpdateExpression: 'ADD #f :amount SET #ttl = if_not_exists(#ttl, :exp)',
      ConditionExpression: 'attribute_not_exists(#f) OR #f <= :threshold',
      ExpressionAttributeNames: { '#f': field, '#ttl': 'expiresAt' },
      ExpressionAttributeValues: {
        ':amount': amount,
        ':threshold': max - amount,
        ':exp': expiresAt,
      },
      ReturnValues: 'UPDATED_NEW',
    };
    try {
      const result = (await this.client.send(new UpdateCommand(input))) as {
        Attributes?: Record<string, unknown>;
      };
      const value = result.Attributes?.[field];
      return typeof value === 'number' ? value : amount;
    } catch (error) {
      if (isConditionalFailure(error)) return null;
      throw error;
    }
  }

  async add(
    key: string,
    increments: Record<string, number>,
    expiresAt: number,
  ): Promise<void> {
    const names: Record<string, string> = { '#ttl': 'expiresAt' };
    const values: Record<string, number> = { ':exp': expiresAt };
    const parts: string[] = [];
    Object.entries(increments).forEach(([field, amount], index) => {
      names[`#f${index}`] = field;
      values[`:v${index}`] = amount;
      parts.push(`#f${index} :v${index}`);
    });
    if (parts.length === 0) return;
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: key, sk: COUNTER_SK },
        UpdateExpression: `ADD ${parts.join(', ')} SET #ttl = if_not_exists(#ttl, :exp)`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }

  async put(entry: QuestionLogEntry, expiresAt: number): Promise<void> {
    const input: PutCommandInput = {
      TableName: this.tableName,
      Item: {
        pk: `log#${entry.at.slice(0, 10)}`,
        sk: `${entry.at}#${entry.requestId}`,
        ...entry,
        expiresAt,
      },
    };
    await this.client.send(new PutCommand(input));
  }
}
