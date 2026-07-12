import { describe, it, expect } from 'vitest';
import { hmacSha256Hex, safeEqualHex } from './hmac';

describe('hmacSha256Hex', () => {
  it('produces the RFC test vector for the standard test message', () => {
    const result = hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog');
    expect(result).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('produces different output for a different secret', () => {
    const output1 = hmacSha256Hex('secret1', 'payload');
    const output2 = hmacSha256Hex('secret2', 'payload');
    expect(output1).not.toBe(output2);
  });
});

describe('safeEqualHex', () => {
  it('returns true for two identical hex strings', () => {
    const hex = hmacSha256Hex('key', 'payload');
    expect(safeEqualHex(hex, hex)).toBe(true);
  });

  it('returns false for two different same-length hex strings', () => {
    const hex1 = hmacSha256Hex('key1', 'payload');
    const hex2 = hmacSha256Hex('key2', 'payload');
    expect(safeEqualHex(hex1, hex2)).toBe(false);
  });

  it('returns false on length mismatch', () => {
    expect(safeEqualHex('abcd', 'ab')).toBe(false);
  });

  it('does not throw and returns false for non-hex garbage input', () => {
    expect(safeEqualHex('zzzz', 'abcd')).toBe(false);
  });

  it('returns false when the attacker-supplied signature is non-hex but the same length', () => {
    expect(safeEqualHex('abcd', 'zzzz')).toBe(false);
  });

  it('returns false for odd-length and empty signatures', () => {
    expect(safeEqualHex('abc', 'abc')).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
  });
});
