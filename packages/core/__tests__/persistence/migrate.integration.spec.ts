import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { GenericContainer, Wait } from "testcontainers";

import { createRelayOS, type RelayPlugin } from "../../src/index.js";
import { findExecutionById, findExecutionsByEventId } from "../../src/persistence/executions.repo.js";
import { migrate } from "../../src/persistence/migrate.js";
import { findStepsByExecution } from "../../src/persistence/steps.repo.js";

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSchemaName(): string {
  return uniqueId("relayos_it").replace(/[^a-zA-Z0-9_]/g, "_");
}

async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await producer();
    if (predicate(value)) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for integration condition`);
}

async function getTableCount(pool: Pool, schema: string, table: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${schema}.${table}`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function createRuntime(
  pool: Pool,
  schema: string,
  plugin: RelayPlugin,
  retryOverrides?: Partial<{
    maxAttempts: number;
    backoffBaseMs: number;
    backoffMultiplier: number;
    backoffMaxMs: number;
  }>,
) {
  await migrate(pool, schema);

  return createRelayOS({
    database: { pool, schema },
    retry: {
      maxAttempts: retryOverrides?.maxAttempts ?? 1,
      backoffBaseMs: retryOverrides?.backoffBaseMs ?? 100,
      backoffMultiplier: retryOverrides?.backoffMultiplier ?? 2,
      backoffMaxMs: retryOverrides?.backoffMaxMs ?? 1_000,
    },
    concurrency: { maxConcurrent: 1 },
    retryPollIntervalMs: 1_000,
    plugins: [plugin],
  });
}

describe("core persistence integration", () => {
  let container: Awaited<ReturnType<GenericContainer["start"]>>;
  let pool: Pool;
  let skipReason: string | null = null;

  beforeAll(async () => {
    try {
      container = await new GenericContainer("postgres:16-alpine")
        .withEnvironment({
          POSTGRES_DB: "postgres",
          POSTGRES_USER: "postgres",
          POSTGRES_PASSWORD: "postgres",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"))
        .start();

      pool = new Pool({
        host: container.getHost(),
        port: container.getMappedPort(5432),
        database: "postgres",
        user: "postgres",
        password: "postgres",
      });

      await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Could not find a working container runtime strategy")
      ) {
        skipReason = error.message;
        return;
      }

      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  }, 120_000);

  it("creates tables and fills them through actual core processing", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let verifyRuns = 0;
    let normalizeRuns = 0;
    let deliverRuns = 0;

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify(rawBody, headers) {
        expect(rawBody.toString()).toBe('{"repository":"relayos"}');
        expect(headers["x-github-event"]).toBe("push");
        verifyRuns += 1;
      },
      async normalize(rawBody, headers) {
        normalizeRuns += 1;
        return {
          provider: "github",
          eventName: headers["x-github-event"] ?? "unknown",
          externalEventId: uniqueId("evt"),
          payload: JSON.parse(rawBody.toString()),
          rawPayload: rawBody.toString(),
          headers,
        };
      },
      resolveHandler(eventName) {
        if (eventName !== "push") {
          return null;
        }

        return async (ctx) => {
          await ctx.step("deliver", async () => {
            deliverRuns += 1;
            return { delivered: true };
          });
          await ctx.log("info", "delivered webhook", { provider: ctx.event.provider });
        };
      },
    });

    try {
      const eventId = await runtime.processEvent({
        provider: "github",
        rawBody: Buffer.from('{"repository":"relayos"}'),
        headers: { "x-github-event": "push" },
      });

      const execution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "completed",
      );

      const steps = await waitFor(
        () => findStepsByExecution(pool, schema, execution.id),
        (rows) => rows.length === 1 && rows[0]?.status === "completed",
      );
      const logs = await pool.query<{ level: string; message: string; metadata: { provider: string } }>(
        `SELECT level, message, metadata FROM ${schema}.execution_logs ORDER BY created_at ASC`,
      );

      const tables = await pool.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
          ORDER BY table_name ASC
        `,
        [schema],
      );

      const counts = await pool.query<{ table_name: string; count: string }>(
        `
          SELECT 'events' AS table_name, COUNT(*)::text AS count FROM ${schema}.events
          UNION ALL
          SELECT 'execution_logs' AS table_name, COUNT(*)::text AS count FROM ${schema}.execution_logs
          UNION ALL
          SELECT 'executions' AS table_name, COUNT(*)::text AS count FROM ${schema}.executions
          UNION ALL
          SELECT 'retry_schedules' AS table_name, COUNT(*)::text AS count FROM ${schema}.retry_schedules
          UNION ALL
          SELECT 'steps' AS table_name, COUNT(*)::text AS count FROM ${schema}.steps
          ORDER BY table_name ASC
        `,
      );

      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "events",
        "execution_logs",
        "executions",
        "retry_schedules",
        "steps",
      ]);
      expect(counts.rows).toEqual([
        { table_name: "events", count: "1" },
        { table_name: "execution_logs", count: "1" },
        { table_name: "executions", count: "1" },
        { table_name: "retry_schedules", count: "0" },
        { table_name: "steps", count: "1" },
      ]);
      expect(steps.map((step) => [step.step_name, step.status])).toEqual([
        ["deliver", "completed"],
      ]);
      expect(steps[0]?.output).toEqual({ delivered: true });
      expect(logs.rows).toEqual([
        {
          level: "info",
          message: "delivered webhook",
          metadata: { provider: "github" },
        },
      ]);
      expect(verifyRuns).toBe(1);
      expect(normalizeRuns).toBe(1);
      expect(deliverRuns).toBe(1);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("deduplicates repeated deliveries through core ingestion", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let handlerRuns = 0;
    const externalEventId = uniqueId("evt_dedup");

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        return {
          provider: "github",
          eventName: "push",
          externalEventId,
          payload: { repository: "relayos" },
          rawPayload: { repository: "relayos" },
          headers: {},
        };
      },
      resolveHandler() {
        return async (ctx) => {
          await ctx.step("deliver", async () => {
            handlerRuns += 1;
            return { delivered: true };
          });
        };
      },
    });

    try {
      const firstEventId = await runtime.processEvent({
        provider: "github",
        rawBody: Buffer.from("{}"),
        headers: {},
      });
      const secondEventId = await runtime.processEvent({
        provider: "github",
        rawBody: Buffer.from("{}"),
        headers: {},
      });

      const executions = await waitFor(
        () => findExecutionsByEventId(pool, schema, firstEventId),
        (rows) => rows.length === 1 && rows[0]?.status === "completed",
      );

      const counts = await pool.query<{ events: string; executions: string }>(
        `
          SELECT
            (SELECT COUNT(*)::text FROM ${schema}.events) AS events,
            (SELECT COUNT(*)::text FROM ${schema}.executions) AS executions
        `,
      );

      expect(secondEventId).toBe(firstEventId);
      expect(executions).toHaveLength(1);
      expect(counts.rows[0]).toEqual({ events: "1", executions: "1" });
      expect(handlerRuns).toBe(1);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("rejects verification failures without persisting events or executions", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {
        throw new Error("invalid signature");
      },
      async normalize() {
        return {
          provider: "github",
          eventName: "push",
          externalEventId: uniqueId("evt_verify"),
          payload: {},
          rawPayload: {},
          headers: {},
        };
      },
      resolveHandler() {
        return null;
      },
    });

    try {
      await expect(
        runtime.processEvent({
          provider: "github",
          rawBody: Buffer.from("{}"),
          headers: {},
        }),
      ).rejects.toThrow("invalid signature");

      expect(await getTableCount(pool, schema, "events")).toBe(0);
      expect(await getTableCount(pool, schema, "executions")).toBe(0);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("rejects unknown providers without persisting events or executions", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    await migrate(pool, schema);
    const runtime = createRelayOS({
      database: { pool, schema },
      retry: {
        maxAttempts: 1,
        backoffBaseMs: 100,
        backoffMultiplier: 2,
        backoffMaxMs: 1_000,
      },
      concurrency: { maxConcurrent: 1 },
      retryPollIntervalMs: 1_000,
      plugins: [],
    });

    try {
      await expect(
        runtime.processEvent({
          provider: "missing",
          rawBody: Buffer.from("{}"),
          headers: {},
        }),
      ).rejects.toThrow('No plugin registered for provider: "missing"');

      expect(await getTableCount(pool, schema, "events")).toBe(0);
      expect(await getTableCount(pool, schema, "executions")).toBe(0);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("creates a fresh execution chain when replaying an event", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let handlerRuns = 0;

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler(eventName) {
        if (eventName !== "push") {
          return null;
        }

        return async (ctx) => {
          await ctx.step("deliver", async () => {
            handlerRuns += 1;
            return { replayed: handlerRuns };
          });
        };
      },
    });

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "push",
        externalEventId: uniqueId("evt_replay"),
        payload: { kind: "replay" },
        rawPayload: { kind: "replay" },
        headers: {},
      });

      await waitFor(
        () => findExecutionsByEventId(pool, schema, ingest.eventId),
        (rows) => rows.length === 1 && rows[0]?.status === "completed",
      );

      await runtime.replay(ingest.eventId);

      const executions = await waitFor(
        () => findExecutionsByEventId(pool, schema, ingest.eventId),
        (rows) => rows.length === 2 && rows.every((row) => row.status === "completed"),
      );

      expect(executions.map((execution) => execution.attempt)).toEqual([0, 0]);
      expect(new Set(executions.map((execution) => execution.id)).size).toBe(2);
      expect(handlerRuns).toBe(2);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("uses the generic onEvent fallback when no semantic handler exists", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let fallbackRuns = 0;

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler() {
        return null;
      },
      onEvent: async (ctx) => {
        await ctx.step("fallback", async () => {
          fallbackRuns += 1;
          return { handled: true };
        });
      },
    });

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "issue_comment",
        externalEventId: uniqueId("evt_fallback"),
        payload: { action: "created" },
        rawPayload: { action: "created" },
        headers: {},
      });

      const execution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "completed",
      );
      const steps = await findStepsByExecution(pool, schema, execution.id);

      expect(steps.map((step) => [step.step_name, step.status])).toEqual([
        ["fallback", "completed"],
      ]);
      expect(fallbackRuns).toBe(1);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("completes execution as a no-op when no handler is registered", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler() {
        return null;
      },
    });

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "unhandled-event",
        externalEventId: uniqueId("evt_noop"),
        payload: { ignored: true },
        rawPayload: { ignored: true },
        headers: {},
      });

      const execution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "completed",
      );
      const steps = await findStepsByExecution(pool, schema, execution.id);

      expect(steps).toEqual([]);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("persists retry schedules when handler failures are eligible for retry", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();

    const runtime = await createRuntime(
      pool,
      schema,
      {
        provider: "github",
        async verify() {},
        async normalize() {
          throw new Error("normalize is not used in this integration test");
        },
        resolveHandler(eventName) {
          if (eventName !== "retry-needed") {
            return null;
          }

          return async (ctx) => {
            await ctx.step("persist", async () => ({ saved: true }));
            throw new Error("eligible retry failure");
          };
        },
      },
      { maxAttempts: 2 },
    );

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "retry-needed",
        externalEventId: uniqueId("evt_retry"),
        payload: { state: "retry" },
        rawPayload: { state: "retry" },
        headers: {},
      });

      const retryingExecution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (execution) => execution !== null && execution.status === "retrying",
      );

      const steps = await waitFor(
        () => findStepsByExecution(pool, schema, retryingExecution.id),
        (rows) => rows.some((step) => step.step_name === "persist" && step.status === "completed"),
      );

      const retrySchedules = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${schema}.retry_schedules`,
      );

      expect(steps.map((step) => [step.step_name, step.status])).toEqual([
        ["persist", "completed"],
      ]);
      expect(retrySchedules.rows[0]?.count).toBe("1");
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("does not create retry schedules once retry attempts are exhausted", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler() {
        return async (ctx) => {
          await ctx.step("persist", async () => ({ saved: true }));
          throw new Error("terminal failure");
        };
      },
    }, { maxAttempts: 1 });

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "terminal-failure",
        externalEventId: uniqueId("evt_terminal"),
        payload: { state: "failed" },
        rawPayload: { state: "failed" },
        headers: {},
      });

      const execution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "failed",
      );

      expect(execution.error_message).toBe("terminal failure");
      expect(await getTableCount(pool, schema, "retry_schedules")).toBe(0);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("picks up due retry schedules on start and creates a new execution attempt", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let shouldFail = true;
    let runs = 0;

    const plugin: RelayPlugin = {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler() {
        return async (ctx) => {
          await ctx.step("persist", async () => {
            runs += 1;
            return { runs };
          });

          if (shouldFail) {
            throw new Error("retry me");
          }
        };
      },
    };

    const firstRuntime = await createRuntime(pool, schema, plugin, {
      maxAttempts: 2,
      backoffBaseMs: 60_000,
      backoffMultiplier: 1,
      backoffMaxMs: 60_000,
    });

    try {
      const ingest = await firstRuntime.ingestEvent({
        provider: "github",
        eventName: "retry-on-start",
        externalEventId: uniqueId("evt_due_retry"),
        payload: { retry: true },
        rawPayload: { retry: true },
        headers: {},
      });

      const firstExecution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "retrying",
      );

      await pool.query(
        `UPDATE ${schema}.executions SET status = 'failed' WHERE id = $1`,
        [firstExecution.id],
      );
      await pool.query(
        `UPDATE ${schema}.retry_schedules SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE execution_id = $1`,
        [firstExecution.id],
      );
    } finally {
      await firstRuntime.shutdown();
    }

    shouldFail = false;
    const secondRuntime = await createRuntime(pool, schema, plugin, {
      maxAttempts: 2,
      backoffBaseMs: 60_000,
      backoffMultiplier: 1,
      backoffMaxMs: 60_000,
    });

    try {
      await secondRuntime.start();

      const executions = await waitFor(
        async () => {
          const events = await pool.query<{ id: string }>(
            `SELECT id FROM ${schema}.events ORDER BY created_at ASC LIMIT 1`,
          );
          const eventId = events.rows[0]?.id;
          return eventId ? findExecutionsByEventId(pool, schema, eventId) : [];
        },
        (rows) => rows.length === 2 && rows.some((row) => row.attempt === 1 && row.status === "completed"),
      );

      expect(executions.map((execution) => execution.attempt)).toEqual([0, 1]);
      expect(await getTableCount(pool, schema, "retry_schedules")).toBe(0);
      expect(runs).toBe(2);
    } finally {
      await secondRuntime.shutdown();
    }
  }, 120_000);

  it("resumes a failed execution without re-running completed steps", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let allowResume = false;
    let persistRuns = 0;
    let notifyRuns = 0;

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler(eventName) {
        if (eventName !== "resume-needed") {
          return null;
        }

        return async (ctx) => {
          await ctx.step("persist", async () => {
            persistRuns += 1;
            return { saved: true };
          });

          if (!allowResume) {
            throw new Error("waiting for manual resume");
          }

          await ctx.step("notify", async () => {
            notifyRuns += 1;
            return { notified: true };
          });
        };
      },
    });

    try {
      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "resume-needed",
        externalEventId: uniqueId("evt_resume"),
        payload: { state: "failing-first" },
        rawPayload: { state: "failing-first" },
        headers: {},
      });

      const failedExecution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (execution) => execution !== null && execution.status === "failed",
      );

      const failedSteps = await waitFor(
        () => findStepsByExecution(pool, schema, failedExecution.id),
        (rows) => rows.some((step) => step.step_name === "persist" && step.status === "completed"),
      );

      expect(failedSteps.map((step) => [step.step_name, step.status])).toEqual([
        ["persist", "completed"],
      ]);
      expect(persistRuns).toBe(1);
      expect(notifyRuns).toBe(0);

      allowResume = true;
      await runtime.resume(failedExecution.id);

      const resumedExecution = await waitFor(
        () => findExecutionById(pool, schema, failedExecution.id),
        (execution) => execution !== null && execution.status === "completed",
      );
      const resumedSteps = await waitFor(
        () => findStepsByExecution(pool, schema, failedExecution.id),
        (rows) => rows.some((step) => step.step_name === "notify" && step.status === "completed"),
      );

      expect(resumedExecution?.id).toBe(failedExecution.id);
      expect(resumedSteps.map((step) => [step.step_name, step.status])).toEqual([
        ["persist", "completed"],
        ["notify", "completed"],
      ]);
      expect(persistRuns).toBe(1);
      expect(notifyRuns).toBe(1);

      await expect(runtime.progress(failedExecution.id)).resolves.toEqual(
        expect.objectContaining({
          completedSteps: ["persist", "notify"],
          pendingSteps: [],
        }),
      );
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);

  it("recovers running executions on start and preserves completed step state", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    let allowFinish = false;
    let persistRuns = 0;
    let notifyRuns = 0;

    const plugin: RelayPlugin = {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler() {
        return async (ctx) => {
          await ctx.step("persist", async () => {
            persistRuns += 1;
            return { saved: true };
          });

          if (!allowFinish) {
            throw new Error("simulated crash after first step");
          }

          await ctx.step("notify", async () => {
            notifyRuns += 1;
            return { notified: true };
          });
        };
      },
    };

    const firstRuntime = await createRuntime(pool, schema, plugin);

    let executionId: string | null = null;
    try {
      const ingest = await firstRuntime.ingestEvent({
        provider: "github",
        eventName: "crash-recovery",
        externalEventId: uniqueId("evt_crash"),
        payload: { state: "running" },
        rawPayload: { state: "running" },
        headers: {},
      });

      const failedExecution = await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "failed",
      );
      executionId = failedExecution.id;
      await pool.query(`UPDATE ${schema}.executions SET status = 'running' WHERE id = $1`, [
        failedExecution.id,
      ]);
    } finally {
      await firstRuntime.shutdown();
    }

    allowFinish = true;
    const secondRuntime = await createRuntime(pool, schema, plugin);
    try {
      await secondRuntime.start();

      const recovered = await waitFor(
        () => findExecutionById(pool, schema, executionId!),
        (value) => value !== null && value.status === "completed",
      );
      const steps = await findStepsByExecution(pool, schema, recovered?.id!);

      expect(steps.map((step) => [step.step_name, step.status])).toEqual([
        ["persist", "completed"],
        ["notify", "completed"],
      ]);
      expect(persistRuns).toBe(1);
      expect(notifyRuns).toBe(1);
    } finally {
      await secondRuntime.shutdown();
    }
  }, 120_000);

  it("emits runtime lifecycle signals for execution and step progress", async () => {
    if (skipReason) {
      console.warn(`[RelayOS] Skipping migration integration test: ${skipReason}`);
      return;
    }

    const schema = createSchemaName();
    const signals: string[] = [];

    const runtime = await createRuntime(pool, schema, {
      provider: "github",
      async verify() {},
      async normalize() {
        throw new Error("normalize is not used in this integration test");
      },
      resolveHandler(eventName) {
        if (eventName !== "signal-test") {
          return null;
        }

        return async (ctx) => {
          await ctx.step("observe", async () => ({ ok: true }));
        };
      },
    });

    try {
      const unsubscribe = runtime.subscribe((signal) => {
        signals.push(signal.type);
      });

      const ingest = await runtime.ingestEvent({
        provider: "github",
        eventName: "signal-test",
        externalEventId: uniqueId("evt_signal"),
        payload: { observed: true },
        rawPayload: { observed: true },
        headers: {},
      });

      await waitFor(
        async () => {
          const executions = await findExecutionsByEventId(pool, schema, ingest.eventId);
          return executions[0] ?? null;
        },
        (value) => value !== null && value.status === "completed",
      );

      unsubscribe();

      expect(signals).toEqual([
        "execution_started",
        "step_started",
        "step_completed",
        "execution_completed",
      ]);
    } finally {
      await runtime.shutdown();
    }
  }, 120_000);
});
