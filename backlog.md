# RelayOS Core v1 — Agile Story Backlog

# Epic 1 — Workspace & Tooling

---

## REL-001 — Initialize pnpm workspace

### Context

RelayOS is a multi-package runtime ecosystem. Establish the foundational workspace configuration required for package management and shared tooling.

### Tasks

- Configure `pnpm-workspace.yaml`
- Setup root package.json
- Configure shared tsconfig
- Configure shared scripts

### Acceptance Criteria

- Workspace installs successfully
- Shared scripts run successfully

---

## REL-002 — Configure TypeScript build pipeline

### Context

All RelayOS packages should support fast ESM/CJS builds with generated type declarations.

### Tasks

- Configure tsup
- Configure package exports
- Generate type declarations

### Acceptance Criteria

- Example package builds successfully

---

## REL-003 — Configure workspace testing infrastructure

### Context

Execution runtimes require strong automated testing from the beginning due to retries, concurrency, and persistence complexity.

### Tasks

- Configure Vitest
- Configure coverage
- Add workspace test scripts

### Acceptance Criteria

- Tests execute from workspace root

---

## REL-004 — Bootstrap `@relayos/types`

### Context

Shared runtime contracts should exist independently from implementation details.

### Tasks

- Create package
- Configure exports
- Configure build tooling

### Acceptance Criteria

- Package imports successfully

---

## REL-005 — Bootstrap `@relayos/core`

### Context

The core runtime package contains execution orchestration and durable runtime logic.

### Tasks

- Create package
- Configure structure
- Configure build tooling

### Acceptance Criteria

- Package builds successfully

---

## REL-006 — Bootstrap `@relayos/postgres`

### Context

The Postgres package will implement durable execution persistence.

### Tasks

- Create package
- Configure Drizzle
- Configure pg

### Acceptance Criteria

- DB package builds successfully

---

## REL-007 — Bootstrap SDK package

### Context

The SDK package provides the public RelayOS developer experience.

### Tasks

- Create package
- Configure exports

### Acceptance Criteria

- SDK package imports successfully

---

## REL-008 — Bootstrap provider adapter packages

### Context

Provider packages normalize external webhook systems into RelayOS runtime events.

### Packages

```txt id="8h0js0"
provider-stripe
provider-github
```

### Acceptance Criteria

- Packages build successfully

---

## REL-009 — Bootstrap framework adapter packages

### Context

Framework adapters connect RelayOS to HTTP runtimes while keeping the runtime core framework-agnostic.

### Packages

```txt id="6oqvkt"
next
express
```

### Acceptance Criteria

- Packages build successfully

---

## REL-010 — Bootstrap CLI package

### Context

The CLI package will provide runtime operational tooling.

### Acceptance Criteria

- CLI executable runs successfully

---

# Epic 2 — Runtime Contracts

---

## REL-011 — Define execution domain contracts

### Context

Executions are the primary runtime unit inside RelayOS.

### Types

```ts id="g7g5lp"
Execution;
ExecutionStatus;
ExecutionStep;
ExecutionAttempt;
```

### Acceptance Criteria

- Types exported from `@relayos/types`

---

## REL-012 — Define normalized event contract

### Context

All providers should normalize into a single provider-agnostic event shape.

### Acceptance Criteria

- Generic event contract finalized

---

## REL-013 — Define handler contract

### Context

Handlers define how developers interact with RelayOS events.

### Acceptance Criteria

- Typed handler signature finalized

---

## REL-014 — Define runtime context contract

### Context

Execution handlers require runtime metadata, logging, and step orchestration access.

### Acceptance Criteria

- Context contract finalized

---

## REL-015 — Define retry policy contract

### Context

Retry configuration should support future extensibility while remaining deterministic.

### Acceptance Criteria

- Retry contracts exported

---

# Epic 3 — Persistence

---

## REL-016 — Configure Postgres connection management

### Context

RelayOS requires a reusable and resilient Postgres connection layer.

### Acceptance Criteria

- DB connections established successfully

---

## REL-017 — Create execution persistence schema

### Context

Executions require durable state persistence.

### Tables

```txt id="g6x1n5"
executions
```

### Acceptance Criteria

- Execution table migrates successfully

---

## REL-018 — Create execution step persistence schema

### Context

Step persistence enables replayability and runtime observability.

### Tables

```txt id="ijz1n7"
execution_steps
```

### Acceptance Criteria

- Step table migrates successfully

---

## REL-019 — Create execution log persistence schema

### Context

Structured execution logs improve runtime debugging and observability.

### Tables

```txt id="6y5h6y"
execution_logs
```

### Acceptance Criteria

- Log table migrates successfully

---

## REL-020 — Create execution attempt persistence schema

### Context

Retries and replay require durable attempt tracking.

### Tables

```txt id="a7cxn4"
execution_attempts
```

### Acceptance Criteria

- Attempt table migrates successfully

---

## REL-021 — Implement execution persistence operations

### Context

The runtime requires CRUD operations for execution lifecycle management.

### Acceptance Criteria

- Executions can be created and updated

---

## REL-022 — Implement execution step persistence operations

### Context

Step execution history should persist durably.

### Acceptance Criteria

- Steps persist successfully

---

## REL-023 — Implement execution logging persistence operations

### Context

Execution logs should persist and remain queryable.

### Acceptance Criteria

- Logs persist successfully

---

## REL-024 — Implement execution locking

### Context

The runtime must prevent concurrent execution processing.

### Acceptance Criteria

- Concurrent processing prevented

---

# Epic 4 — Runtime Engine

---

## REL-025 — Implement `createRelayCore`

### Context

The runtime factory wires together persistence, handlers, retries, logging, and lifecycle hooks.

### Acceptance Criteria

- Runtime instance initializes successfully

---

## REL-026 — Implement event ingestion

### Context

Normalized events should enter the runtime deterministically.

### Acceptance Criteria

- Events ingest successfully

---

## REL-027 — Persist ingested executions

### Context

Every ingested event should create durable execution state.

### Acceptance Criteria

- Executions persist on ingestion

---

## REL-028 — Resolve handlers for ingested events

### Context

The runtime should map normalized events to registered handlers.

### Acceptance Criteria

- Handlers resolve correctly

---

## REL-029 — Execute registered handlers

### Context

Handlers should execute with runtime context.

### Acceptance Criteria

- Handlers execute successfully

---

## REL-030 — Implement execution status transitions

### Context

Execution lifecycle transitions should be deterministic and validated.

### Acceptance Criteria

- Invalid transitions rejected

---

## REL-031 — Implement execution lifecycle hooks

### Context

Hooks enable extensibility without bloating the runtime core.

### Acceptance Criteria

- Hooks fire correctly

---

# Epic 5 — Handler Runtime

---

## REL-032 — Implement handler registry

### Context

The runtime requires centralized handler registration and resolution.

### Acceptance Criteria

- Handlers register successfully

---

## REL-033 — Implement `relay.on()`

### Context

`relay.on()` is the primary developer-facing runtime API.

### Acceptance Criteria

- Event handlers register successfully

---

## REL-034 — Implement runtime execution context

### Context

Handlers should receive runtime metadata and utilities.

### Acceptance Criteria

- Context accessible inside handlers

---

## REL-035 — Implement scoped execution logger

### Context

Execution logs should automatically include execution metadata.

### Acceptance Criteria

- Logs scoped to executions

---

## REL-036 — Implement `ctx.step.run()`

### Context

Step execution enables durable orchestration semantics.

### Acceptance Criteria

- Steps persist correctly

---

## REL-037 — Persist step execution results

### Context

Step persistence enables replayability and observability.

### Acceptance Criteria

- Step results stored successfully

---

# Epic 6 — Retries & Replay

---

## REL-038 — Implement retry scheduling

### Context

Failed executions should schedule retry attempts automatically.

### Acceptance Criteria

- Retries schedule correctly

---

## REL-039 — Implement retry attempt tracking

### Context

Retry history should persist durably.

### Acceptance Criteria

- Retry attempts persist successfully

---

## REL-040 — Implement exponential backoff calculation

### Context

Retry delays should prevent retry storms.

### Acceptance Criteria

- Backoff delays calculated correctly

---

## REL-041 — Retry failed executions automatically

### Context

The runtime should recover safely from transient failures.

### Acceptance Criteria

- Failed executions retry successfully

---

## REL-042 — Implement replay execution creation

### Context

Replay should generate new executions from previous execution state.

### Acceptance Criteria

- Replay executions created successfully

---

## REL-043 — Implement replay lineage tracking

### Context

Replay history should remain inspectable.

### Acceptance Criteria

- Replay lineage persists successfully

---

## REL-044 — Implement execution stopping

### Context

Stopped executions should halt future retries and processing.

### Acceptance Criteria

- Executions stop successfully

---

# Epic 7 — Provider Adapters

---

## REL-045 — Verify Stripe webhook signatures

### Context

Stripe integrations require secure webhook verification.

### Acceptance Criteria

- Invalid signatures rejected

---

## REL-046 — Normalize Stripe webhook events

### Context

Stripe events should convert into RelayOS normalized events.

### Acceptance Criteria

- Stripe events normalize successfully

---

## REL-047 — Add typed Stripe event helpers

### Context

Typed helpers improve SDK ergonomics significantly.

### Acceptance Criteria

- Typed Stripe events supported

---

## REL-048 — Verify GitHub webhook signatures

### Context

GitHub integrations require secure signature validation.

### Acceptance Criteria

- Invalid GitHub signatures rejected

---

## REL-049 — Normalize GitHub webhook events

### Context

GitHub events should normalize into RelayOS events.

### Acceptance Criteria

- GitHub events normalize successfully

---

# Epic 8 — Framework Adapters

---

## REL-050 — Implement Express webhook adapter

### Context

Express integration validates framework agnosticism.

### Acceptance Criteria

- Express integration functional

---

## REL-051 — Implement Next.js webhook adapter

### Context

Next.js is critical for developer adoption.

### Acceptance Criteria

- Next.js integration functional

---

# Epic 9 — CLI

---

## REL-052 — Initialize RelayOS CLI

### Context

The CLI provides runtime operational tooling.

### Acceptance Criteria

- CLI executable works

---

## REL-053 — Implement `relay dev`

### Context

Developers require local runtime processing during development.

### Acceptance Criteria

- Local runtime works

---

## REL-054 — Implement `relay migrate`

### Context

Migrations should run consistently via the CLI.

### Acceptance Criteria

- Migrations execute successfully

---

## REL-055 — Implement `relay replay`

### Context

Replay functionality should be operationally accessible.

### Acceptance Criteria

- Replay command works

---

# Epic 10 — Dashboard MVP

---

## REL-056a — `relay studio`: local studio instead of a hosted dashboard app

### Context

Preferred direction over a separately-hosted `apps/web`-style dashboard: a
`relay studio` CLI command, in the spirit of `prisma studio` / `drizzle
studio` - loads the user's `relay.ts`, spins up a local web UI (executions
list, execution detail with steps/logs, retry/replay actions) bound to
their real local database, no deployment or separate app required. Backed
by the same `ExecutionStore` methods `relay inspect`/`relay events list`
already use.

### Acceptance Criteria

- `relay studio` starts a local server and opens a browser tab
- Execution list, detail (steps/logs), and retry/replay all work against
  the user's real configured database

---

## REL-056 — Initialize dashboard application

### Context

The dashboard provides execution observability and debugging.

### Acceptance Criteria

- Dashboard boots successfully

---

## REL-057 — Display execution list

### Context

Developers should inspect runtime executions visually.

### Acceptance Criteria

- Executions visible in dashboard

---

## REL-058 — Display execution details

### Context

Detailed inspection improves debugging and replay workflows.

### Acceptance Criteria

- Execution details view functional

---

## REL-059 — Display execution logs

### Context

Developers should inspect runtime logs visually.

### Acceptance Criteria

- Logs visible in dashboard

---

## REL-060 — Display retry history

### Context

Retry observability improves debugging significantly.

### Acceptance Criteria

- Retry history visible

---

# Epic 11 — Reliability & Hardening

---

## REL-061 — Prevent duplicate event ingestion

### Context

Webhook providers retry aggressively. Duplicate processing must be prevented.

### Acceptance Criteria

- Duplicate events ignored safely

---

## REL-062 — Add runtime integration tests

### Context

Core runtime flows should be validated end-to-end.

### Acceptance Criteria

- Integration suite passes

---

## REL-063 — Add concurrency stress tests

### Context

The runtime should behave safely under concurrent load.

### Acceptance Criteria

- Concurrency tests pass

---

## REL-064 — Write getting started documentation

### Context

RelayOS should provide strong onboarding and developer ergonomics.

### Acceptance Criteria

- Quickstart documentation completed
