import { describe, it, expect } from 'vitest';
import { detectDialectName, type RawSqlClient } from './detect';

describe('detectDialectName', () => {
  it('detects sqlite from a .prepare()/.close() shaped client', () => {
    const client = { prepare: () => ({}), close: () => {} } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('sqlite');
  });

  it('detects mysql from a .getConnection() shaped client', () => {
    const client = { getConnection: () => {}, end: () => {} } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('mysql');
  });

  it('falls back to postgres for a .connect()/.end() shaped client', () => {
    const client = {
      connect: async () => ({}),
      end: async () => {},
      options: {},
    } as unknown as RawSqlClient;
    expect(detectDialectName(client)).toBe('postgres');
  });
});
