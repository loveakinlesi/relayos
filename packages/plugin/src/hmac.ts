import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of a payload, hex-encoded - the signature scheme used by most
 *  webhook providers (Stripe, GitHub, and others). */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function isHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

/**
 * Constant-time comparison of two hex signatures. Returns false (instead of
 * throwing) on length mismatch or non-hex input, so a malformed attacker
 * -supplied signature can never crash verification.
 */
export function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  if (!isHex(expectedHex) || !isHex(actualHex)) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
