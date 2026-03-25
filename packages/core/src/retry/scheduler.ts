import type { Pool } from "pg";
import type { DbExecution } from "../types/execution.js";
import type { RetryPolicy } from "../types/config.js";
import { ExecutionStatus } from "../types/event.js";
import { updateExecutionStatus } from "../persistence/executions.repo.js";
import { createRetrySchedule } from "../persistence/retry-schedules.repo.js";
import { isRetryEligible } from "./policy.js";
import { computeNextAttemptAt } from "./backoff.js";

/**
 * Called when an execution fails.
 *
 * If eligible for retry:
 * 1. Persists a retry_schedule row (crash-safe — survives process restarts).
 * 2. Transitions the execution status to "retrying".
 *
 * If max attempts exceeded, the execution remains "failed" — no schedule created.
 */
export async function scheduleRetry(
  pool: Pool,
  schema: string,
  execution: DbExecution,
  policy: RetryPolicy,
): Promise<void> {
  if (!isRetryEligible(execution, policy)) {
    return;
  }

  const nextAttemptAt = computeNextAttemptAt(execution.attempt, policy);

  await createRetrySchedule(pool, schema, {
    eventId: execution.event_id,
    executionId: execution.id,
    nextAttemptAt,
    retryCount: execution.attempt,
    policySnapshot: policy,
  });

  await updateExecutionStatus(pool, schema, execution.id, ExecutionStatus.Retrying);
}
