import type { Pool } from "pg";
import type { RelayOS } from "../index.js";
import type { ConcurrencyQueue } from "../runtime/queue.js";
import { ExecutionStatus } from "../types/event.js";
import {
  findExecutionById,
  updateExecutionStatus,
} from "../persistence/executions.repo.js";
import { getRelayOSInternals } from "../runtime/internals.js";

/**
 * Resumes a failed execution without creating a new execution row.
 *
 * Resume characteristics:
 * - re-uses the same execution record
 * - completed steps are preserved and skipped on re-run
 * - retry attempt counter is unchanged
 *
 * Use for: manual recovery after system crash, paused retry orchestration.
 */
export async function resumeExecution(
  pool: Pool,
  schema: string,
  executionId: string,
  queue: ConcurrencyQueue,
  runExecution: (id: string) => Promise<void>,
): Promise<void> {
  const execution = await findExecutionById(pool, schema, executionId);
  if (!execution) {
    throw new Error(`Execution "${executionId}" not found`);
  }
  if (execution.status !== ExecutionStatus.Failed) {
    throw new Error(
      `Cannot resume execution "${executionId}": expected status "failed", got "${execution.status}"`,
    );
  }

  await updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Pending);
  queue.enqueue(() => runExecution(executionId));
}

export async function resumeFailedExecution(
  runtime: RelayOS,
  executionId: string,
): Promise<void> {
  const { pool, schema, queue, executeTask } = getRelayOSInternals(runtime);

  return resumeExecution(pool, schema, executionId, queue, executeTask);
}
