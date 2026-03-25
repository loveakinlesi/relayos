# RelayOS Engine Flow

## Purpose of this Document

This document defines the **exact runtime execution flow** of RelayOS.

It explains how the engine:

- receives webhook events
- persists event data
- schedules executions
- runs handlers deterministically
- checkpoints step progress
- handles failures and retries
- supports replay and resume

This flow is the **authoritative behavioural contract**
for implementing `engine.ts`.

---

## High Level Runtime Pipeline

The RelayOS engine processes webhooks using the following pipeline:

```flowchart
HTTP Request
↓
Plugin Verification
↓
Event Normalization
↓
Event Persistence
↓
Execution Creation
↓
Queue Scheduling
↓
Execution Runtime
↓
Step Checkpointing
↓
Completion OR Retry Scheduling
```

Each stage is strictly ordered.

---

## Stage 1 — Incoming Webhook Request

A framework adapter receives an HTTP request and forwards:

- raw body
- headers
- request metadata
- provider identifier

The engine must not:

- parse provider logic
- perform signature verification
- assume payload structure

The engine delegates these responsibilities to plugins.

---

## Stage 2 — Plugin Verification

The engine resolves the responsible plugin based on request path.

Plugin verification flow:

1. plugin extracts signature headers
2. plugin validates authenticity
3. plugin confirms payload integrity

If verification fails:

- engine returns `400` or `401`
- event is NOT stored
- no execution is created

Verification must be **fail-fast and side-effect free**.

---

## Stage 3 — Event Normalization

The plugin converts raw webhook payload into normalized event data:

- provider
- canonical event name
- typed payload
- raw payload snapshot

Normalization must be:

- synchronous or bounded async
- deterministic
- free of external side-effects

The engine now owns a valid normalized event object.

---

## Stage 4 — Event Persistence

The engine inserts a row into:

```
relayos.events
```

This guarantees:

- immutable webhook audit trail
- replay capability
- deduplication via external event id

If deduplication constraint triggers:

- engine may skip execution creation
- engine returns success response
- webhook delivery is treated as already processed

---

## Stage 5 — Execution Creation

Immediately after event insert:

- engine creates execution row
- status = `pending`
- attempt = `0`

Execution represents:

> a workflow instance responsible for handling the event.

This execution is then scheduled into runtime queue.

---

## Stage 6 — Queue Scheduling

RelayOS maintains an in-memory execution queue.

Queue responsibilities:

- enforce configured concurrency limit
- prevent uncontrolled parallelism
- provide FIFO fairness (v1)
- re-schedule retry executions

When capacity available:

- execution moves from `pending` → `running`

Queue must be **crash tolerant via DB state**.

---

## Stage 7 — Execution Runtime

Execution runtime performs:

1. resolve plugin handler
2. construct execution context (`ctx`)
3. invoke handler

Handler is executed inside:

- try/catch boundary
- deterministic lifecycle wrapper

Execution start timestamp recorded.

---

## Stage 8 — Step Lifecycle

When handler calls:

```ts
await ctx.step("name", fn);
```

Engine behaviour:

1. lookup step record
2. if status = completed → return cached output
3. else
   - create/update step row
   - mark running
   - execute function
   - store output
   - mark completed

If step throws:

- step marked failed
- execution runtime aborts
- retry flow triggered

Steps must execute sequentially.

---

## Stage 9 — Successful Completion

If handler finishes without uncaught error:

- execution status → `completed`
- finished_at timestamp recorded
- queue slot released

No retry scheduled.

Execution lifecycle ends.

---

## Stage 10 — Failure Handling

If handler throws outside step recovery:

- execution status → `failed`
- error message persisted
- retry policy evaluated

Retry eligibility determined by:

- max attempts
- error classification (future feature)
- manual cancellation state

---

## Stage 11 — Retry Scheduling

If retry eligible:

1. compute next_attempt_at
2. insert retry_schedule row
3. execution status → `retrying`

A background poller (or same runtime loop) will:

- detect due retries
- create new execution attempt
- enqueue execution

Completed steps are reused.

---

## Stage 12 — Replay Flow

Replay is an explicit operator action.

Replay behaviour:

1. new execution created
2. attempt reset to `0`
3. handler executed from beginning
4. previous execution history untouched

Replay enables:

- debugging production incidents
- reprocessing after bug fixes
- testing new handler logic

---

## Stage 13 — Resume Flow

Resume applies to failed execution.

Resume behaviour:

- execution status updated → `pending`
- execution re-enqueued
- completed steps skipped

Resume differs from retry because:

- retry follows policy scheduling
- resume is manual recovery action

---

## Engine Concurrency Guarantees

RelayOS ensures:

- executions run in parallel
- steps run sequentially within execution
- retry executions respect concurrency limits

This model simplifies:

- resource usage prediction
- execution determinism
- operational safety

---

## Idempotency Enforcement Points

Idempotency is guaranteed through:

- event uniqueness constraints
- step completion uniqueness
- execution attempt tracking
- deterministic step replay

Engine must never:

- re-run completed step side-effects
- mutate historical event payload

---

## Engine Crash Recovery

On engine restart:

1. load executions with status = running
2. mark them failed OR pending (configurable)
3. resume queue scheduling
4. process due retry schedules

This ensures:

- no execution is permanently lost
- partial progress preserved

---

## Observability Hooks

During execution lifecycle engine should emit:

- execution started
- step started
- step completed
- execution failed
- retry scheduled
- execution completed

These signals allow:

- CLI inspection tools
- dashboards
- alerting integrations

---

## Summary

RelayOS engine behaves as a **deterministic webhook workflow orchestrator**.

Its responsibilities are:

- durable event ingestion
- execution scheduling
- step checkpoint enforcement
- retry orchestration
- replay and resume control

Correct implementation of this flow ensures:

> webhook handling becomes reliable, debuggable, and production-safe.
