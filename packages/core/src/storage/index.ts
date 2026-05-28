// Storage interfaces — persistence contracts; no implementation; swappable by design

/**
 * Persistence contract for execution state.
 * Implementations live in adapter packages (e.g. @relayos/postgres).
 * Core never depends on a concrete implementation.
 */
export interface ExecutionStore {
  // placeholder — persistence operations defined in future stories
}
