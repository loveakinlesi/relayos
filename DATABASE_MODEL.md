# RelayOS Database Model

## Purpose of this Document

RelayOS provides a **durable execution runtime** for webhook workflows.

To guarantee reliability, the runtime persists:

- incoming webhook events
- execution attempts
- step progress
- retry scheduling
- execution logs

This document defines the **canonical database schema** used by RelayOS v1.

The schema is intentionally:

- Postgres-first
- prescriptive
- runtime-owned
- isolated under a dedicated schema namespace

Example default schema:

```
relayos.*
```

Applications may use the same database safely.

---

## Design Principles

### 1. Events are immutable

An external webhook fact must never be mutated after storage.

### 2. Executions are attempts

Multiple executions may exist for one event.

### 3. Steps represent durable checkpoints

Completed steps must never re-run.

### 4. Retries are scheduled state transitions

Retry orchestration must survive crashes.

### 5. Observability is first-class

Execution progress must be inspectable without reading logs.

---

## Entity Relationship Overview

```mermaid
event
└── execution
├── step
├── execution_log
└── retry_schedule
```

---

## Table: events

Represents a single webhook delivery.

### Columns

| Column            | Type          | Description                |
| ----------------- | ------------- | -------------------------- |
| id                | uuid (pk)     | Event identifier           |
| provider          | text          | e.g. stripe, github        |
| event_name        | text          | canonical normalized event |
| external_event_id | text nullable | provider event id          |
| payload           | jsonb         | normalized typed payload   |
| raw_payload       | jsonb         | original provider payload  |
| headers           | jsonb         | webhook headers snapshot   |
| received_at       | timestamptz   | arrival time               |
| created_at        | timestamptz   | row creation               |

### Constraints

- `(provider, external_event_id)` unique when external id exists
- payload immutable after insert

---

## Table: executions

Represents an attempt to process an event.

### Columns

| Column        | Type                 | Description                                                   |
| ------------- | -------------------- | ------------------------------------------------------------- |
| id            | uuid (pk)            | execution id                                                  |
| event_id      | uuid fk → events.id  |
| status        | text                 | pending / running / completed / failed / retrying / cancelled |
| attempt       | integer              | retry attempt number                                          |
| started_at    | timestamptz nullable |
| finished_at   | timestamptz nullable |
| error_message | text nullable        |
| created_at    | timestamptz          |

### Behaviour

- First execution created immediately after event insert
- Retry creates **new execution row**
- Replay creates **new execution chain**

---

## Table: steps

Represents durable progress checkpoints inside an execution.

### Columns

| Column        | Type                    | Description                            |
| ------------- | ----------------------- | -------------------------------------- |
| id            | uuid pk                 |
| execution_id  | uuid fk → executions.id |
| step_name     | text                    |
| status        | text                    | pending / running / completed / failed |
| output        | jsonb nullable          | serialized step result                 |
| error_message | text nullable           |
| started_at    | timestamptz nullable    |
| finished_at   | timestamptz nullable    |
| created_at    | timestamptz             |

### Constraints

- `(execution_id, step_name)` unique

### Behaviour

- Step row created when first entered
- If completed → runtime skips on retry
- Output stored for replay diagnostics

---

## Table: retry_schedules

Represents future retry planning.

### Columns

| Column          | Type        | Description |
| --------------- | ----------- | ----------- |
| id              | uuid pk     |
| event_id        | uuid        |
| execution_id    | uuid        |
| next_attempt_at | timestamptz |
| retry_count     | integer     |
| policy_snapshot | jsonb       |
| created_at      | timestamptz |

### Behaviour

- Created when execution fails
- Removed when retry execution starts
- Allows background poller or worker to schedule retries

---

## Table: execution_logs

Structured observability logs.

### Columns

| Column       | Type           | Description         |
| ------------ | -------------- | ------------------- |
| id           | uuid pk        |
| execution_id | uuid           |
| level        | text           | info / warn / error |
| message      | text           |
| metadata     | jsonb nullable |
| created_at   | timestamptz    |

### Purpose

- deterministic debugging
- dashboard visualisation
- replay inspection

---

## Replay Model

Replay does NOT mutate existing records.

Replay flow:

1. create new execution with attempt = 0
2. optionally copy step outputs (future optimisation)
3. mark execution chain relation (future feature)

This keeps history intact.

---

## Resume Model

Resume operates on **latest failed execution**.

Runtime behaviour:

- mark execution status → retrying
- enqueue execution again
- skip completed steps

No new execution row is created unless retry policy dictates.

---

## Idempotency Strategy

RelayOS guarantees idempotency through:

- immutable event storage
- step completion uniqueness
- execution attempt tracking
- provider external event id uniqueness

Applications should still design:

- downstream side-effects to be safe

RelayOS ensures **workflow safety**, not business safety.

---

## Schema Namespacing

RelayOS tables live inside configurable schema:

Example:

```sql
CREATE SCHEMA IF NOT EXISTS relayos;
```

Benefits:

- zero table name collision
- easy migration ownership
- clear operational boundary
- safer multi-tenant DB usage

---

## Future Extensions (Not v1)

The schema intentionally leaves room for:

- execution dependency graphs
- parallel step DAG execution
- distributed worker leasing
- priority queues
- dead letter queues
- plugin-specific state tables

These will be added after runtime stabilisation.

---

## Summary

RelayOS persistence layer guarantees:

- durable webhook ingestion
- replayable execution workflows
- checkpointed step progress
- structured retry orchestration
- deep runtime observability

This schema forms the **reliability foundation**
of the RelayOS execution engine.
