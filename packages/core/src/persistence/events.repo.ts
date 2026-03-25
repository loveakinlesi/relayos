import type { Pool } from "pg";
import type { DbEvent } from "../types/execution.js";

export type InsertEventInput = {
  provider: string;
  eventName: string;
  externalEventId: string | null;
  payload: unknown;
  rawPayload: unknown;
  headers: Record<string, string>;
};

/**
 * Inserts a new event row.
 *
 * When external_event_id is present, a partial unique index on
 * (provider, external_event_id) prevents duplicates. On conflict the
 * existing row is returned unchanged (idempotent delivery guarantee).
 */
export async function insertEvent(
  pool: Pool,
  schema: string,
  input: InsertEventInput,
): Promise<DbEvent> {
  const { provider, eventName, externalEventId, payload, rawPayload, headers } = input;

  const result = await pool.query<DbEvent>(
    `INSERT INTO ${schema}.events
       (provider, event_name, external_event_id, payload, raw_payload, headers)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
     ON CONFLICT (provider, external_event_id)
       WHERE external_event_id IS NOT NULL
       DO UPDATE SET created_at = ${schema}.events.created_at
     RETURNING *`,
    [
      provider,
      eventName,
      externalEventId,
      JSON.stringify(payload),
      JSON.stringify(rawPayload),
      JSON.stringify(headers),
    ],
  );

  const event = result.rows[0];
  if (!event) {
    throw new Error("Failed to insert event");
  }

  return event;
}

export async function findEventById(
  pool: Pool,
  schema: string,
  id: string,
): Promise<DbEvent | null> {
  const result = await pool.query<DbEvent>(
    `SELECT * FROM ${schema}.events WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
