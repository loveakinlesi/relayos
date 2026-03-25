import { Pool } from "pg";

/**
 * Creates a new pg connection pool.
 * Called once inside createRelayOS() — not at module import time.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
