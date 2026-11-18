import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { COUNTER_SK, DynamoStore, type DocumentSender } from './store-dynamo';

class FakeClient implements DocumentSender {
  sent: (UpdateCommand | PutCommand)[] = [];
  constructor(private readonly reply: () => unknown = () => ({})) {}
  async send(command: UpdateCommand | PutCommand) {
    this.sent.push(command);
    return this.reply();
  }
}

describe('DynamoStore', () => {
  it('reserves with a single conditional, atomic UpdateItem', async () => {
    const client = new FakeClient(() => ({ Attributes: { committed: 900 } }));
    const store = new DynamoStore(client, 'table');
    expect(
      await store.addIfWithin('spend#2026-11-18', 'committed', 300, 1000, 42),
    ).toBe(900);
    const [command] = client.sent;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command?.input).toEqual({
      TableName: 'table',
      Key: { pk: 'spend#2026-11-18', sk: COUNTER_SK },
      UpdateExpression: 'ADD #f :amount SET #ttl = if_not_exists(#ttl, :exp)',
      ConditionExpression: 'attribute_not_exists(#f) OR #f <= :threshold',
      ExpressionAttributeNames: { '#f': 'committed', '#ttl': 'expiresAt' },
      ExpressionAttributeValues: {
        ':amount': 300,
        ':threshold': 700,
        ':exp': 42,
      },
      ReturnValues: 'UPDATED_NEW',
    });
  });

  it('maps a failed condition to null and rethrows other errors', async () => {
    const conditional = Object.assign(new Error('nope'), {
      name: 'ConditionalCheckFailedException',
    });
    const store = new DynamoStore(
      new FakeClient(() => {
        throw conditional;
      }),
      'table',
    );
    expect(await store.addIfWithin('k', 'count', 1, 5, 0)).toBeNull();

    const broken = new DynamoStore(
      new FakeClient(() => {
        throw new Error('throttled');
      }),
      'table',
    );
    await expect(broken.addIfWithin('k', 'count', 1, 5, 0)).rejects.toThrow(
      'throttled',
    );
  });

  it('does not even try when the amount alone exceeds the maximum', async () => {
    const client = new FakeClient();
    const store = new DynamoStore(client, 'table');
    expect(await store.addIfWithin('k', 'committed', 10, 5, 0)).toBeNull();
    expect(client.sent).toHaveLength(0);
  });

  it('adds several fields in one unconditional update', async () => {
    const client = new FakeClient();
    await new DynamoStore(client, 'table').add(
      'spend#d',
      { committed: -200, spent: 100, requests: 1 },
      7,
    );
    expect(client.sent[0]?.input).toMatchObject({
      Key: { pk: 'spend#d', sk: COUNTER_SK },
      UpdateExpression:
        'ADD #f0 :v0, #f1 :v1, #f2 :v2 SET #ttl = if_not_exists(#ttl, :exp)',
      ExpressionAttributeNames: {
        '#f0': 'committed',
        '#f1': 'spent',
        '#f2': 'requests',
        '#ttl': 'expiresAt',
      },
      ExpressionAttributeValues: {
        ':v0': -200,
        ':v1': 100,
        ':v2': 1,
        ':exp': 7,
      },
    });
    expect(client.sent[0]?.input).not.toHaveProperty('ConditionExpression');
  });

  it('writes question logs partitioned by day', async () => {
    const client = new FakeClient();
    await new DynamoStore(client, 'table').put(
      {
        requestId: 'r1',
        at: '2026-11-18T10:00:00.000Z',
        locale: 'es',
        question: 'q',
        turn: 1,
        answer: 'a',
        sources: [],
        outcome: 'answered',
        model: 'm',
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costMicroUsd: 1,
        latencyMs: 1,
      },
      99,
    );
    const command = client.sent[0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command?.input).toMatchObject({
      TableName: 'table',
      Item: {
        pk: 'log#2026-11-18',
        sk: '2026-11-18T10:00:00.000Z#r1',
        question: 'q',
        expiresAt: 99,
      },
    });
  });
});
