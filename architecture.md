# RelayOS Architecture

## Overview

RelayOS is a **durable webhook execution runtime** designed to provide reliable, observable, and replayable processing of external event notifications.

Unlike traditional webhook handlers that execute once per HTTP request, RelayOS introduces a **persistent execution model** where each webhook event is processed as a structured workflow with checkpointed steps and deterministic retry behaviour.

This document describes the **high-level architecture, runtime components, data flow, and package boundaries** of RelayOS.

---

## Architectural Goals

RelayOS is designed to achieve the following system properties:

- Deterministic webhook execution
- Step-level idempotency
- Persistent retry orchestration
- Safe execution replay and resume
- Bounded concurrency execution control
- Framework-agnostic runtime design
- Provider-agnostic plugin architecture
- Developer-friendly operational tooling

---

## System Layers

RelayOS is organised into four primary architectural layers.

### 1. Core Runtime Layer

**Package:** `relayos/core`

This layer is responsible for:

- Execution orchestration
- Concurrency queue management
- Step checkpoint lifecycle
- Retry decision and scheduling logic
- Execution replay and resume control
- Progress state computation
- Plugin resolution and handler invocation

The core runtime is intentionally:

- HTTP-agnostic
- framework-agnostic
- provider-agnostic

It operates purely on **normalized events**.

---

### 2. Provider Plugin Layer

**Packages:** `relayos/stripe`, future `relayos/github`, etc.

Provider plugins encapsulate:

- Signature verification
- Raw webhook payload parsing
- Provider-specific event mapping
- Semantic handler registration
- Fallback generic event handling

Plugins translate provider-specific payloads into the **normalized event model** consumed by the core runtime.

---

### 3. Framework Adapter Layer

**Packages:** `relayos/nestjs`, future `relayos/nextjs`, etc.

Framework adapters are responsible for:

- Receiving HTTP webhook requests
- Extracting raw request body
- Passing request metadata to provider plugin
- Forwarding normalized events into the core runtime

Adapters contain no execution orchestration logic.

---

### 4. Operational Tooling Layer

**Package:** `relayos/cli`

This layer provides:

- Database schema migrations
- Local webhook simulation
- Execution replay commands
- Execution inspection utilities

Tooling enhances developer productivity and operational debugging.

---

## Runtime Execution Model

RelayOS introduces a **persistent execution model**.

Each webhook follows this lifecycle:

1. Incoming webhook request received
2. Provider plugin validates signature and normalizes event
3. Event persisted in database
4. Execution instance created
5. Execution scheduled via runtime queue
6. Handler invoked with Relay context
7. Steps checkpointed during execution
8. Execution completes or schedules retry

This model ensures:

- webhook handlers are safely restartable
- side-effects are not duplicated
- failures can be recovered deterministically

---

## Execution Queue and Concurrency

The core runtime maintains an **in-memory execution queue**.

Key properties:

- Global concurrency limit enforced
- Executions processed FIFO
- Steps within a single execution run sequentially
- Failed executions release concurrency slots immediately
- Retry scheduling persists across process restarts

This design provides predictable resource usage while maintaining high throughput.

---

## Step Checkpointing Model

Developers define workflow steps using:

```ts
await ctx.step("unique-step-name", async () => {
  // side-effect
});
```

RelayOS guarantees:

- Completed steps are never re-executed
- Retry attempts only execute unfinished steps
- Replay executions can skip previously completed work
- Step state is persisted independently of execution state

This enables idempotent workflow construction without requiring developers to manually implement deduplication logic.

---

## Retry Orchestration

Retry behaviour is governed by:

- Global retry configuration
- Execution attempt tracking
- Backoff calculation strategy
- Persistent retry scheduling records

**Retry flow:**

1. Execution failure triggers retry evaluation
2. If eligible, execution enters retrying state
3. Retry scheduler triggers new execution instance at scheduled time
4. Retry execution resumes from first step but skips completed checkpoints

This allows safe recovery from:

- transient infrastructure failures
- provider rate limits
- downstream service outages

---

## Replay and Resume Semantics

RelayOS supports two distinct recovery mechanisms.

### Replay

Replay creates a new execution chain for an existing event.

Used for:
- debugging handler logic
- reprocessing historical events
- recovery after system upgrades

Replay does not mutate previous execution history.

### Resume

Resume continues an existing failed execution.

Used when:
- execution stopped mid-workflow
- retry attempts were manually paused
- system crash occurred during processing

Resume preserves step completion state.

---

## Persistence Model (v1)

RelayOS v1 uses a Postgres-first persistence strategy.

The runtime manages its own schema containing:

- webhook events
- execution records
- step checkpoints
- retry schedules
- execution logs

Persistence responsibilities include:

- enforcing event idempotency constraints
- enabling deterministic execution replay
- providing execution progress visibility
- ensuring crash-safe retry scheduling

Future versions may introduce pluggable persistence drivers.

---

## Plugin Resolution Flow

During execution start:

1. Runtime reads event provider identifier
2. Plugin registry resolves matching provider plugin
3. Plugin resolves semantic handler based on event name
4. Handler invoked with execution context

**Fallback behaviour:**
- If semantic handler not defined, plugin onEvent handler may execute
- If no handler exists, execution completes without failure

This design allows gradual adoption of semantic handlers.

---

## Execution Context (`ctx`)

The Relay execution context provides:

- normalized event payload
- step checkpoint API
- retry scheduling control
- structured runtime logging
- execution metadata access

Context creation is controlled by the core runtime to ensure deterministic behaviour.

---

## Package Boundary Strategy

RelayOS packages follow a namespace package architecture:

- `relayos` → public SDK surface
- `relayos/core` → runtime engine
- `relayos/stripe` → provider plugin
- `relayos/nestjs` → framework adapter
- `relayos/cli` → developer tooling

This enables:

- independent package evolution
- clean dependency graph
- tree-shakable distribution
- scalable ecosystem growth

---

## Future Architectural Extensions

Planned future capabilities include:

- distributed execution coordination
- horizontal worker scaling
- pluggable persistence drivers
- execution prioritization strategies
- workflow DAG parallelism
- event batching optimizations
- real-time execution monitoring UI

These will be introduced after validating the stability of the core runtime model.

---

## Summary

RelayOS introduces a workflow-style execution architecture for webhooks.

By combining:

- persistent execution state
- checkpointed step semantics
- deterministic retry scheduling
- replayable event processing

it transforms webhook handling from a fragile request-handler pattern into a reliable backend execution system.

This architecture forms the foundation for a broader event-driven orchestration platform.
