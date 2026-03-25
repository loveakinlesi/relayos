# relayos/core

Durable webhook execution runtime for RelayOS.

`relayos/core` turns inbound webhooks into durable workflow-like executions backed by Postgres. It verifies and normalizes provider events through plugins, persists execution state, checkpoints step progress, schedules retries, and exposes replay and resume through explicit subpath APIs.

## Status

This package is currently experimental and marked `private` in the workspace. The API is usable inside this repository, but it should be treated as pre-1.0 runtime infrastructure.

## Why This Exists

Traditional webhook handlers usually run once inside an HTTP request and hope the whole flow succeeds. That falls apart when:

- providers deliver duplicates
- downstream dependencies fail halfway through processing
- the process crashes after a side effect but before completion
- operators need to replay historical events safely

`relayos/core` addresses that by treating webhook handling as a persistent execution model:

- incoming events are stored immutably
- each processing attempt is tracked as an execution
- business logic is broken into durable steps
- retries are scheduled persistently
- failed work can be resumed or replayed deterministically

## Features

- Provider-agnostic plugin interface for verification and normalization
- Postgres-backed persistence for events, executions, steps, retries, and logs
- In-memory FIFO queue with bounded concurrency
- Durable `ctx.step()` checkpoints for idempotent workflow progress
- Configurable retry policy with exponential backoff
- Replay support for reprocessing an existing event
- Resume support for manually re-enqueuing a failed execution
- Runtime config validation with Zod
- ESM, CJS, and type declaration builds via `tsup`

## Package Layout

- `src/index.ts`: runtime entrypoint and public exports
- `src/runtime`: ingestion, queueing, execution, and retry polling
- `src/context`: execution context, durable steps, and structured logging
- `src/plugins`: plugin registry and handler resolution
- `src/persistence`: Postgres client, repositories, and schema migration
- `src/retry`: retry eligibility, backoff, and scheduling
- `src/replay`: replay and resume operations
- `src/types`: public runtime and persistence types

## Requirements

- Node.js `>=20`
- PostgreSQL with permission to create schema objects in the configured namespace

## Installation

This package is currently private to the workspace, so installation is primarily for local monorepo usage.

```sh
pnpm --filter relayos/core add pg zod
```

If this package is later published, the runtime dependencies needed by consumers are:

- `pg`
- `zod`

## Quick Start

### 1. Create a plugin

Plugins are the provider boundary. They verify authenticity, normalize the raw request, and resolve a handler for a normalized event name.

```ts
import crypto from "node:crypto";
import { type RelayPlugin } from "relayos/core";
import { VerificationError } from "relayos/core/errors";

const githubPlugin: RelayPlugin = {
  provider: "github",

  async verify(rawBody, headers) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
    const signature = headers["x-hub-signature-256"];

    const digest =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (!signature || signature !== digest) {
      throw new VerificationError("Invalid GitHub signature", "github");
    }
  },

  async normalize(rawBody, headers) {
    const payload = JSON.parse(rawBody.toString("utf8"));

    return {
      provider: "github",
      eventName: headers["x-github-event"] ?? "unknown",
      externalEventId: String(headers["x-github-delivery"] ?? "") || null,
      payload,
      rawPayload: payload,
      headers,
    };
  },

  resolveHandler(eventName) {
    if (eventName !== "push") {
      return null;
    }

    return async (ctx) => {
      await ctx.log("info", "Processing GitHub push", {
        eventId: ctx.event.id,
      });

      const syncResult = await ctx.step("sync-repository", async () => {
        return { syncedAt: new Date().toISOString() };
      });

      await ctx.log("info", "Repository sync completed", syncResult);
    };
  },
};
```

### 2. Create the runtime

```ts
import { createRelayOS } from "relayos/core";

const relay = createRelayOS(
  {
    database: {
      connectionString: process.env.DATABASE_URL!,
      schema: "relayos",
    },
    retry: {
      maxAttempts: 5,
      backoffBaseMs: 1_000,
      backoffMultiplier: 2,
      backoffMaxMs: 60_000,
    },
    concurrency: {
      maxConcurrent: 20,
    },
    retryPollIntervalMs: 5_000,
  },
  [githubPlugin],
);
```

### 3. Run the schema migration

```ts
import { Pool } from "pg";
import { migrate } from "relayos/core/persistence/migrate";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

await migrate(pool, "relayos");
await pool.end();
```

### 4. Forward incoming webhook deliveries

```ts
await relay.processEvent({
  provider: "github",
  rawBody: requestBodyBuffer,
  headers: normalizedHeaders,
});
```

### 5. Shut down cleanly

```ts
await relay.shutdown();
```

### 6. Use optional recovery APIs explicitly

```ts
import { replayEvent } from "relayos/core/replay/replay";
import { resumeFailedExecution } from "relayos/core/replay/resume";

await replayEvent(relay, "evt_123");
await resumeFailedExecution(relay, "exe_123");
```

## Core Concepts

### Event

An immutable, normalized record of a webhook delivery. Events are stored once and become the source of truth for future executions, retries, and replay operations.

### Execution

A single attempt to process an event. Multiple executions may exist for one event over time. Executions move through statuses such as `pending`, `running`, `completed`, `failed`, and `retrying`.

### Step

A durable checkpoint declared with `ctx.step(name, fn)`. If a step has already completed for the current execution, the stored output is returned immediately and the function is not re-run.

### Replay

Replay creates a brand new execution chain for an existing event. It preserves all previous execution history and starts with `attempt = 0`.

### Resume

Resume reuses a failed execution record and re-enqueues it. Completed steps remain completed and are skipped when the execution runs again.

## Runtime Flow

At a high level, `relayos/core` processes a webhook in this order:

1. Resolve the plugin for the provider.
2. Verify authenticity through `plugin.verify()`.
3. Normalize the raw request through `plugin.normalize()`.
4. Persist the event into Postgres.
5. Create a new execution row.
6. Enqueue execution work in the in-memory queue.
7. Mark the execution as running.
8. Resolve the event handler.
9. Execute handler logic with a durable execution context.
10. Mark the execution completed on success, or failed and schedule retry on error.

Retries are handled by a background poller that scans due retry schedules, creates a new execution attempt, and re-enqueues it.

## Public API

### `createRelayOS(rawConfig, plugins)`

Creates the runtime and starts background retry polling.

Arguments:

- `rawConfig`: unknown config object validated by `RelayConfigSchema`
- `plugins`: array of `RelayPlugin`

Returns an object with:

- `processEvent(webhook)`
- `shutdown()`

### `relay.processEvent(webhook)`

Accepts:

```ts
type IncomingWebhook = {
  provider: string;
  rawBody: Buffer;
  headers: Record<string, string>;
};
```

Behavior:

- throws if no plugin is registered for `provider`
- throws if the plugin rejects verification
- persists the event and execution before any handler runs
- schedules actual execution asynchronously through the queue

### `replayEvent(relay, eventId)`

Creates a fresh execution for a previously stored event.

Characteristics:

- new execution row
- `attempt = 0`
- existing execution history remains untouched

Import from `relayos/core/replay/replay`.

### `resumeFailedExecution(relay, executionId)`

Resumes a failed execution in place.

Characteristics:

- same execution record
- same retry attempt value
- completed steps are preserved
- throws if the execution does not exist or is not failed

Import from `relayos/core/replay/resume`.

### `relay.shutdown()`

Stops the retry poller and closes the Postgres connection pool.

## Plugin Contract

Every provider plugin must implement:

```ts
type RelayPlugin = {
  readonly provider: string;
  verify(rawBody: Buffer, headers: Record<string, string>): Promise<void>;
  normalize(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<RawNormalizedEvent>;
  resolveHandler(eventName: string): HandlerFn | null;
};
```

Guidelines:

- `verify()` should fail fast and avoid side effects
- `normalize()` should be deterministic and side-effect free
- `resolveHandler()` should return `null` for no-op events rather than throwing
- plugins should remain stateless with respect to execution progress

## Execution Context

Handlers receive an `ExecutionContext` with:

- `event`: normalized event payload and metadata
- `executionId`: current execution identifier
- `attempt`: zero-indexed attempt number
- `step(name, fn)`: durable step boundary
- `log(level, message, metadata?)`: structured execution logging

Example:

```ts
return async (ctx) => {
  await ctx.log("info", "Start", {
    executionId: ctx.executionId,
    attempt: ctx.attempt,
  });

  const customer = await ctx.step("load-customer", async () => {
    return { id: "cus_123" };
  });

  await ctx.step("send-email", async () => {
    await sendEmail(customer.id);
  });
};
```

## Configuration

The runtime validates configuration with Zod before startup.

### Required

```ts
{
  database: {
    connectionString: string;
  }
}
```

### Optional fields and defaults

```ts
{
  database: {
    schema: "relayos";
  };
  retry: {
    maxAttempts: 3,
    backoffBaseMs: 1000,
    backoffMultiplier: 2,
    backoffMaxMs: 60000,
  };
  concurrency: {
    maxConcurrent: 10,
  };
  retryPollIntervalMs: 5000;
}
```

Notes:

- `database.schema` must match `[a-zA-Z_][a-zA-Z0-9_]*`
- retry attempts are zero-indexed in execution records
- `retryPollIntervalMs` controls how often due retries are scanned

## Persistence Model

The built-in migration creates a dedicated schema with the following tables:

- `events`
- `executions`
- `steps`
- `retry_schedules`
- `execution_logs`

Important guarantees:

- events are immutable records of inbound deliveries
- events are de-duplicated by `(provider, external_event_id)` when an external ID is present
- steps are unique by `(execution_id, step_name)`
- retry schedules are persisted independently of process memory

## Errors

The package exports the following error classes:

- `VerificationError`
- `StepError`
- `ExecutionError`
- `PluginNotFoundError`

Typical uses:

- `VerificationError`: plugin could not authenticate the request
- `StepError`: a durable step failed and the execution should abort
- `PluginNotFoundError`: no plugin exists for a provider

## Development

Available package scripts:

```sh
pnpm --filter relayos/core typecheck
pnpm --filter relayos/core test
pnpm --filter relayos/core build
pnpm --filter relayos/core test:watch
```

The current test suite covers:

- queue concurrency behavior
- plugin registry behavior
- retry backoff math
- retry eligibility rules
- step checkpoint behavior
- configuration parsing defaults and validation

## Operational Notes

- Normalize header names before calling `processEvent()` so plugin behavior is predictable.
- Keep plugin normalization deterministic; avoid network calls or mutable shared state.
- Put side effects inside `ctx.step()` boundaries rather than inline in handlers.
- Use replay for reprocessing and debugging.
- Use resume for manual recovery of a failed execution.
- Always call `shutdown()` during graceful process termination.

## Limitations

Current v1 constraints:

- Postgres-first persistence model
- in-memory execution queue
- sequential steps within an execution
- no distributed worker coordination
- no DAG or parallel workflow planner

## License

No separate package license file is currently shipped from this package directory. Repository-level licensing and publication policy should be finalized before external distribution.
