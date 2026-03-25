import type { Pool } from "pg";
import { StepStatus } from "../types/event.js";
import { findStepByName, upsertStep } from "../persistence/steps.repo.js";
import { StepError } from "../errors/index.js";

/**
 * Core step runtime.
 *
 * Behaviour:
 * 1. Look up existing step record.
 * 2. If already completed → return cached output immediately (idempotent).
 * 3. Otherwise → mark running, execute fn, checkpoint result (completed/failed).
 * 4. On failure → mark failed, throw StepError so the execution is aborted.
 */
export async function runStep<T>(
  pool: Pool,
  schema: string,
  executionId: string,
  stepName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = await findStepByName(pool, schema, executionId, stepName);

  if (existing?.status === StepStatus.Completed) {
    return existing.output as T;
  }

  await upsertStep(pool, schema, executionId, stepName, {
    status: StepStatus.Running,
    startedAt: new Date(),
  });

  try {
    const result = await fn();

    await upsertStep(pool, schema, executionId, stepName, {
      status: StepStatus.Completed,
      output: result,
      finishedAt: new Date(),
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await upsertStep(pool, schema, executionId, stepName, {
      status: StepStatus.Failed,
      errorMessage: message,
      finishedAt: new Date(),
    });

    throw new StepError(message, stepName, err);
  }
}
