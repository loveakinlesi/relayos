import type { DbExecution } from "../types/execution.js";
import type { RetryPolicy } from "../types/config.js";

/**
 * Returns true when the execution is eligible for another attempt.
 * attempt is 0-indexed: attempt 0 = first try, so a maxAttempts of 3
 * allows attempts 0, 1, 2 (the failed execution is at attempt N,
 * the new attempt would be N+1 — allowed as long as N+1 < maxAttempts).
 */
export function isRetryEligible(execution: DbExecution, policy: RetryPolicy): boolean {
  return execution.attempt + 1 < policy.maxAttempts;
}
