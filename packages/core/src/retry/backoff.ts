import type { RetryPolicy } from "../types/config.js";

/**
 * Computes the timestamp for the next retry attempt using exponential backoff.
 *
 * delay = min(backoffBaseMs * backoffMultiplier^attempt, backoffMaxMs)
 */
export function computeNextAttemptAt(attempt: number, policy: RetryPolicy): Date {
  const delayMs = Math.min(
    policy.backoffBaseMs * Math.pow(policy.backoffMultiplier, attempt),
    policy.backoffMaxMs,
  );
  return new Date(Date.now() + delayMs);
}
