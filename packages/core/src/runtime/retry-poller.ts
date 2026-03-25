import type { Pool } from "pg";
import type { ConcurrencyQueue } from "./queue.js";
import {
  findDueRetrySchedules,
  deleteRetrySchedule,
} from "../persistence/retry-schedules.repo.js";
import { createExecution } from "../persistence/executions.repo.js";

/**
 * Background poller that detects due retry schedules and re-enqueues executions.
 *
 * Poll cycle per interval:
 * 1. Find all retry_schedules where next_attempt_at <= now.
 * 2. Delete each schedule (consumed).
 * 3. Create a new execution attempt for the same event.
 * 4. Enqueue the new execution.
 */
export function createRetryPoller(
  pool: Pool,
  schema: string,
  queue: ConcurrencyQueue,
  runExecution: (executionId: string) => Promise<void>,
  intervalMs: number,
) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    const due = await findDueRetrySchedules(pool, schema, new Date());

    for (const schedule of due) {
      await deleteRetrySchedule(pool, schema, schedule.id);
      const execution = await createExecution(
        pool,
        schema,
        schedule.event_id,
        schedule.retry_count + 1,
      );
      queue.enqueue(() => runExecution(execution.id));
    }
  }

  return {
    start(): void {
      timer = setInterval(() => {
        poll().catch((err) => {
          console.error("[RelayOS] Retry poller error:", err);
        });
      }, intervalMs);
    },

    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
