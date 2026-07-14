import { describe, it, expect } from 'vitest';
import { fromJson, fromTimestamp, toJson, toTimestamp } from './coerce';

describe('toJson / fromJson', () => {
  it('round-trips a plain object through a JSON string', () => {
    const value = { foo: 'bar', n: 1 };
    expect(fromJson(toJson(value))).toEqual(value);
  });

  it('fromJson passes through an already-parsed object unchanged', () => {
    const value = { foo: 'bar' };
    expect(fromJson(value)).toBe(value);
  });
});

describe('toTimestamp / fromTimestamp', () => {
  const iso = '2026-07-12T21:00:00.000Z';

  it('mysql gets a Date, postgres and sqlite get the ISO string back', () => {
    expect(toTimestamp(iso, 'mysql')).toBeInstanceOf(Date);
    expect(toTimestamp(iso, 'postgres')).toBe(iso);
    expect(toTimestamp(iso, 'sqlite')).toBe(iso);
  });

  it('fromTimestamp normalizes a Date back to an ISO string', () => {
    expect(fromTimestamp(new Date(iso))).toBe(iso);
  });

  it('fromTimestamp passes an already-string value through', () => {
    expect(fromTimestamp(iso)).toBe(iso);
  });
});
