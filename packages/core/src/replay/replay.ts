import type { Pool } from "pg";
import type { RelayOS } from "../index.js";
import type { DbExecution } from "../types/execution.js";
import { createExecution } from "../persistence/executions.repo.js";
import { getRelayOSInternals } from "../runtime/internals.js";

/**
 * Creates a new execution chain for an existing event.
 *
 * Replay characteristics:
 * - starts a fresh execution (attempt = 0)
 * - does NOT mutate or reference prior executions
 * - prior execution history is fully preserved
 *
 * Use for: debugging, reprocessing after bug fixes, simulating historical events.
 */
export async function createReplay(
  pool: Pool,
  schema: string,
  eventId: string,
): Promise<DbExecution> {
  return createExecution(pool, schema, eventId, 0);
}

export async function replayEvent(runtime: RelayOS, eventId: string): Promise<void> {
  const { pool, schema, queue, executeTask } = getRelayOSInternals(runtime);
  const execution = await createReplay(pool, schema, eventId);
  queue.enqueue(() => executeTask(execution.id));
}
