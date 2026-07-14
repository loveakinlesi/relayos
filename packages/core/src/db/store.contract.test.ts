import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Kysely, CamelCasePlugin } from 'kysely';
import BetterSqlite3 from 'better-sqlite3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { createPool as createMysqlPool } from 'mysql2';
import { Pool as PgPool } from 'pg';
import type { Execution, ExecutionStore } from '../types';
import type { Database } from './schema';
import { buildDialect, type RawSqlClient, type SqlDialectName } from './detect';
import { createSqlExecutionStore } from './store';
import { migrateToLatest } from './migrate';

function makeExecution(overrides: Partial<Execution> = {}): Execution {
  const id = crypto.randomUUID();
  return {
    id,
    eventId: `evt-${id}`,
    eventType: 'test.event',
    eventData: { foo: 'bar' },
    status: 'pending',
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

type Setup = {
  name: SqlDialectName;
  setup: () => Promise<{ store: ExecutionStore; teardown: () => Promise<void> }>;
};

// Runs migrations and builds the store against the SAME underlying dialect -
// note there is no intermediate `rawDb.destroy()` here: destroying a Kysely
// instance closes its underlying client/pool, which would also break the
// `db` instance below since they share that same client/pool.
async function migrateAndCreateStore(
  client: RawSqlClient,
  dialectName: SqlDialectName,
): Promise<ExecutionStore> {
  const { dialect } = buildDialect(client);
  const rawDb = new Kysely<any>({ dialect });
  await migrateToLatest(rawDb, dialectName);
  const db = new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] });
  return createSqlExecutionStore(db, dialectName);
}

const dialects: Setup[] = [
  {
    name: 'sqlite',
    async setup() {
      const client = new BetterSqlite3(':memory:');
      const store = await migrateAndCreateStore(client, 'sqlite');
      return {
        store,
        teardown: async () => {
          client.close();
        },
      };
    },
  },
  {
    name: 'postgres',
    async setup() {
      const explicitUrl = process.env['TEST_DATABASE_URL'];
      let connectionString: string;
      let container: StartedPostgreSqlContainer | undefined;
      if (explicitUrl) {
        connectionString = explicitUrl;
      } else {
        container = await new PostgreSqlContainer('postgres:16-alpine').start();
        connectionString = container.getConnectionUri();
      }
      const client = new PgPool({ connectionString });
      const store = await migrateAndCreateStore(client, 'postgres');
      return {
        store,
        teardown: async () => {
          await client.end();
          await container?.stop();
        },
      };
    },
  },
  {
    name: 'mysql',
    async setup() {
      const explicitUrl = process.env['TEST_MYSQL_URL'];
      let connectionString: string;
      let container: StartedMySqlContainer | undefined;
      if (explicitUrl) {
        connectionString = explicitUrl;
      } else {
        container = await new MySqlContainer('mysql:8.4').start();
        connectionString = container.getConnectionUri();
      }
      const client = createMysqlPool(connectionString);
      const store = await migrateAndCreateStore(client, 'mysql');
      return {
        store,
        teardown: async () => {
          await new Promise<void>((resolvePromise, reject) => {
            client.end((err) => (err ? reject(err) : resolvePromise()));
          });
          await container?.stop();
        },
      };
    },
  },
];

describe.each(dialects)('createSqlExecutionStore ($name)', ({ setup }) => {
  let store: ExecutionStore;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ store, teardown } = await setup());
  }, 120_000);

  afterAll(async () => {
    await teardown();
  });

  it('create() returns true on first insert, false on a duplicate eventId', async () => {
    const execution = makeExecution();
    expect(await store.create(execution)).toBe(true);
    expect(await store.create(makeExecution({ eventId: execution.eventId }))).toBe(false);
  });

  it('get() and findByEventId() resolve the same execution', async () => {
    const execution = makeExecution();
    await store.create(execution);
    expect((await store.get(execution.id))?.eventId).toBe(execution.eventId);
    expect((await store.findByEventId(execution.eventId))?.id).toBe(execution.id);
    expect(await store.get('does-not-exist')).toBeUndefined();
  });

  it('eventData round-trips through JSON', async () => {
    const execution = makeExecution({ eventData: { nested: { n: 1 }, list: [1, 2, 3] } });
    await store.create(execution);
    expect((await store.get(execution.id))?.eventData).toEqual({
      nested: { n: 1 },
      list: [1, 2, 3],
    });
  });

  it('update() patches fields and clears error to null on success', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.update(execution.id, {
      status: 'failed',
      attempt: 2,
      completedAt: new Date().toISOString(),
      error: 'boom',
    });
    let updated = await store.get(execution.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBe('boom');

    await store.update(execution.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      error: undefined,
    });
    updated = await store.get(execution.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.error).toBeUndefined();
  });

  it('steps are append-only: saveStep never overwrites, getStep returns the latest', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.saveStep({
      id: crypto.randomUUID(),
      executionId: execution.id,
      name: 'my-step',
      status: 'failed',
      error: 'transient',
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    await store.saveStep({
      id: crypto.randomUUID(),
      executionId: execution.id,
      name: 'my-step',
      status: 'completed',
      output: { ok: true },
      createdAt: new Date().toISOString(),
    });

    expect((await store.getStep(execution.id, 'my-step'))?.status).toBe('completed');

    const all = await store.listSteps(execution.id);
    expect(all).toHaveLength(2);
    expect(all[0]?.status).toBe('failed');
    expect(all[1]?.status).toBe('completed');
  });

  it('logs preserve source and insertion order', async () => {
    const execution = makeExecution();
    await store.create(execution);

    await store.saveLog({
      id: crypto.randomUUID(),
      executionId: execution.id,
      level: 'info',
      source: 'system',
      message: 'event ingested',
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    await store.saveLog({
      id: crypto.randomUUID(),
      executionId: execution.id,
      level: 'info',
      source: 'handler',
      message: 'did something',
      createdAt: new Date().toISOString(),
    });

    const logs = await store.listLogs(execution.id);
    expect(logs.map((l) => l.source)).toEqual(['system', 'handler']);
  });

  it('list() returns executions newest first', async () => {
    const first = makeExecution();
    await store.create(first);
    await new Promise((r) => setTimeout(r, 10));
    const second = makeExecution();
    await store.create(second);

    const all = await store.list();
    const firstIndex = all.findIndex((e) => e.id === first.id);
    const secondIndex = all.findIndex((e) => e.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });
});
