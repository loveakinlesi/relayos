import type { Pool } from "pg";
import type { NormalizedEvent } from "../types/event.js";
import type { DbExecution } from "../types/execution.js";
import type { ExecutionContext } from "../types/context.js";
import type { RelayOSSignal } from "../runtime/internals.js";
import { runStep } from "./step.js";
import { logExecution } from "./logger.js";

/**
 * Builds the ExecutionContext handed to handler functions.
 * Each execution gets a fresh context — never shared across executions.
 */
export function createContext(
  pool: Pool,
  schema: string,
  execution: DbExecution,
  event: NormalizedEvent,
  emitSignal: (signal: RelayOSSignal) => void,
): ExecutionContext {
  return {
    event,
    executionId: execution.id,
    attempt: execution.attempt,
    step: (name, fn) => runStep(pool, schema, execution.id, name, fn, emitSignal),
    log: (level, message, metadata) =>
      logExecution(pool, schema, execution.id, level, message, metadata),
  };
}
