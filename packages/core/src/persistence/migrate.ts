import type { Pool } from "pg";

export type MigrationResult = {
  schema: string;
  tables: string[];
};

/**
 * Runs the RelayOS schema migration against the given Postgres pool.
 *
 * Schema name is validated at config-parse time (RelayConfigSchema) and
 * additionally checked here before interpolation — no user input reaches SQL.
 */
export async function migrate(pool: Pool, schema: string): Promise<MigrationResult> {
  // Double-check even though zod config schema already validates this.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(
      `Invalid schema name "${schema}". Must match [a-zA-Z_][a-zA-Z0-9_]*.`,
    );
  }

  const sql = buildSchemaSql(schema);

  await pool.query("BEGIN");

  try {
    await pool.query(sql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return {
    schema,
    tables: [
      "events",
      "executions",
      "steps",
      "retry_schedules",
      "execution_logs",
    ],
  };
}

function buildSchemaSql(s: string): string {
  return `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE SCHEMA IF NOT EXISTS ${s};

    CREATE TABLE IF NOT EXISTS ${s}.events (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      provider          TEXT         NOT NULL,
      event_name        TEXT         NOT NULL,
      external_event_id TEXT,
      payload           JSONB        NOT NULL,
      raw_payload       JSONB        NOT NULL,
      headers           JSONB        NOT NULL DEFAULT '{}',
      received_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    -- Deduplicate only when a provider-scoped external ID exists.
    CREATE UNIQUE INDEX IF NOT EXISTS ${s}_events_provider_ext_id_idx
      ON ${s}.events (provider, external_event_id)
      WHERE external_event_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS ${s}.executions (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id      UUID         NOT NULL REFERENCES ${s}.events(id),
      status        TEXT         NOT NULL DEFAULT 'pending',
      attempt       INTEGER      NOT NULL DEFAULT 0,
      started_at    TIMESTAMPTZ,
      finished_at   TIMESTAMPTZ,
      error_message TEXT,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${s}.steps (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_id  UUID         NOT NULL REFERENCES ${s}.executions(id),
      step_name     TEXT         NOT NULL,
      status        TEXT         NOT NULL DEFAULT 'pending',
      output        JSONB,
      error_message TEXT,
      started_at    TIMESTAMPTZ,
      finished_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (execution_id, step_name)
    );

    CREATE TABLE IF NOT EXISTS ${s}.retry_schedules (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id        UUID         NOT NULL,
      execution_id    UUID         NOT NULL,
      next_attempt_at TIMESTAMPTZ  NOT NULL,
      retry_count     INTEGER      NOT NULL DEFAULT 0,
      policy_snapshot JSONB        NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${s}.execution_logs (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_id  UUID         NOT NULL REFERENCES ${s}.executions(id),
      level         TEXT         NOT NULL,
      message       TEXT         NOT NULL,
      metadata      JSONB,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `;
}
