import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import type { ExecutionStore } from '../types';
import { resolveDatabase } from './resolve';

describe('resolveDatabase', () => {
  it('wraps a raw sqlite client in a Kysely-backed store and can migrate it', async () => {
    const client = new Database(':memory:');
    const { store, migrate } = resolveDatabase(client);

    await migrate();
    const created = await store.create({
      id: '1',
      eventId: 'evt-1',
      eventType: 't',
      eventData: {},
      status: 'pending',
      attempt: 1,
      createdAt: new Date().toISOString(),
    });
    expect(created).toBe(true);
  });

  it('passes a plain ExecutionStore through unchanged, with a no-op migrate()', async () => {
    const custom: ExecutionStore = {
      create: async () => true,
      update: async () => {},
      list: async () => [],
      get: async () => undefined,
      findByEventId: async () => undefined,
      getStep: async () => undefined,
      saveStep: async () => {},
      listSteps: async () => [],
      saveLog: async () => {},
      listLogs: async () => [],
    };

    const { store, migrate } = resolveDatabase(custom);
    expect(store).toBe(custom);
    await expect(migrate()).resolves.toBeUndefined();
  });

  it('accepts the { dialect } escape hatch and no-ops migrate() with a warning', async () => {
    const client = new Database(':memory:');
    const { migrate } = resolveDatabase({ dialect: new SqliteDialect({ database: client }) });
    await expect(migrate()).resolves.toBeUndefined();
  });
});
