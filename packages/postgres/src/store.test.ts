import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Execution } from 'relayos';
import { createDb, type Db } from './client';
import { createPostgresExecutionStore } from './store';
import { runMigrations } from './migrate';

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

describe('createPostgresExecutionStore', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let db: Db;
  let store: ReturnType<typeof createPostgresExecutionStore>;

  beforeAll(async () => {
    // Prefer TEST_DATABASE_URL when set - CI environments that provide
    // Postgres as a service container (e.g. GitHub Actions' `services:`)
    // often can't do Docker-in-Docker, so testcontainers wouldn't work
    // there. Locally (or anywhere with a real container runtime), this
    // spins up a fresh, disposable Postgres with no manual setup at all.
    const explicitUrl = process.env['TEST_DATABASE_URL'];
    let connectionString: string;
    if (explicitUrl) {
      connectionString = explicitUrl;
    } else {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      connectionString = container.getConnectionUri();
    }

    db = createDb(connectionString);
    store = createPostgresExecutionStore(db);
    await runMigrations(db);
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
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

    // Regression guard: a successful retry must clear the stale error, not
    // leave it behind - this was a real bug caught during manual
    // verification when retry support was first added.
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
    await new Promise((r) => setTimeout(r, 10)); // ensure a distinct createdAt
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

  it('lives under the relayos Postgres schema, not public', async () => {
    const result = await db.execute(
      sql`select table_schema from information_schema.tables where table_name = 'executions'`,
    );
    const schemas = (result.rows as { table_schema: string }[]).map((row) => row.table_schema);
    expect(schemas).toContain('relayos');
    expect(schemas).not.toContain('public');
  });

  it('runMigrations is idempotent - running it again does not error', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
  });
});
