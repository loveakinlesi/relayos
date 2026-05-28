import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabase } from './client';

vi.mock('pg', () => ({
  // regular function required — arrow functions are not constructors
  Pool: vi.fn(function () {
    return { end: vi.fn().mockResolvedValue(undefined) };
  }),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({})),
}));

describe('createDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a DatabaseClient with db and close properties', () => {
    const client = createDatabase('postgres://localhost/test');
    expect(client).toHaveProperty('db');
    expect(client.close).toBeTypeOf('function');
  });

  it('creates a Pool with the provided connection string', () => {
    const connectionString = 'postgres://user:pass@localhost:5432/relayos';
    createDatabase(connectionString);
    expect(vi.mocked(Pool)).toHaveBeenCalledWith({ connectionString });
  });

  it('wires drizzle with the pool instance and schema', () => {
    createDatabase('postgres://localhost/test');
    const poolInstance = vi.mocked(Pool).mock.results[0]?.value;
    expect(vi.mocked(drizzle)).toHaveBeenCalledWith(
      poolInstance,
      expect.objectContaining({ schema: expect.any(Object) }),
    );
  });

  it('close() delegates to pool.end() exactly once', async () => {
    const client = createDatabase('postgres://localhost/test');
    const poolInstance = vi.mocked(Pool).mock.results[0]?.value;
    await client.close();
    expect(poolInstance.end).toHaveBeenCalledOnce();
  });
});
