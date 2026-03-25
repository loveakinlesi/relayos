# RelayOS Engineering Rules

This document defines the **strict engineering rules** for the RelayOS repository.

It is a **living document**, but changes must reflect stable architectural decisions — not temporary implementation experiments.

RelayOS is an infrastructure runtime.  
Correctness, determinism, and developer experience are top priorities.

---

## How To Use This File

- Read this file before making structural, runtime, or packaging changes.
- Add rules only when a requirement becomes a **repeatable constraint**.
- Replace outdated rules instead of stacking conflicting guidance.
- Keep rules concrete, testable, and minimal.
- This file is the **single source of truth for engineering discipline**.

---

## 1. Product Philosophy Rules

RelayOS is a **durable webhook execution runtime**.

It is NOT:

- a generic HTTP framework
- a job queue product
- a workflow DAG engine (v1)
- an ORM abstraction layer
- a provider SDK collection

All design decisions must reinforce:

> deterministic, replayable, checkpointed webhook processing.

Prefer:

- boring reliability
- explicit control flow
- inspectable state
- operational clarity

Avoid:

- clever abstractions
- speculative flexibility
- magic behaviour

---

## 2. Runtime Execution Rules

### 2.1 Event → Execution → Step model is mandatory

Every webhook must follow:

```
Event → Execution → Step checkpoints
```

Do not process business logic directly from ingress.

---

### 2.2 Events are immutable

- Stored payloads must never be mutated.
- Raw payload snapshots must be preserved.
- Replay depends on payload integrity.

---

### 2.3 Executions represent attempts

- Multiple executions per event are valid.
- Replay creates a new execution chain.
- Resume continues an existing failed execution.

---

### 2.4 Steps are the only durable side-effect boundary

- Side-effects must live inside `ctx.step()`.
- Completed steps must never re-run.
- Step names must be deterministic and stable.

---

### 2.5 Steps are sequential in v1

Do not implement:

- parallel steps
- DAG execution
- nested step graphs
- speculative concurrency planners

---

### 2.6 Retries must be persistent

- Retry scheduling must survive crashes.
- In-memory retry-only logic is forbidden.

---

### 2.7 Replay must not mutate history

Replay must:

- create new execution records
- preserve historical execution data

---

### 2.8 Engine must be deterministic

Execution behaviour must be reproducible given:

- same event payload
- same step completion state
- same retry policy

---

## 3. Plugin Architecture Rules

### 3.1 Core runtime must remain provider-agnostic

`packages/core` must not include:

- signature verification logic
- provider payload parsing
- provider event mapping

Plugins own:

- verification
- normalization
- semantic handler ergonomics

Core owns:

- execution orchestration
- retries
- step checkpointing
- replay
- persistence

---

### 3.2 Plugins must remain stateless

Plugins must not store:

- execution progress
- retry counters
- workflow state

They may store:

- secrets
- SDK clients
- handler configuration

---

### 3.3 Plugin APIs must stay consistent

Provider packages should expose:

- semantic handlers
- `onEvent` fallback

Avoid inventing inconsistent plugin DSLs.

---

## 4. Database & Persistence Rules

### 4.1 RelayOS owns its schema

- RelayOS tables live in a dedicated schema (default `relayos`).
- Runtime must not depend on user business tables.

---

### 4.2 Postgres-first in v1

Do not add:

- Mongo execution store
- Redis primary persistence
- ORM abstraction layer

Future drivers may exist but v1 is Postgres-native.

---

### 4.3 Runtime manages migrations

Schema evolution must be handled by RelayOS migrations.

---

### 4.4 Persistence enables reliability guarantees

Database model must support:

- replay
- resume
- retry scheduling
- progress inspection

Never bypass persistence for performance shortcuts.

---

## 5. Packaging & Tree-Shaking Rules

### 5.1 Export small modules, not giant registries

Prefer granular exports that allow bundlers to eliminate unused features.

---

### 5.2 Packages must be side-effect free at import time

Do not:

- connect to databases on import
- start workers on import
- register global listeners implicitly

Initialization must be explicit.

---

### 5.3 ESM is the primary build target

- Optimize runtime distribution for ESM.
- CJS support may exist but must not drive design decisions.

---

### 5.4 Avoid barrel files that eagerly import everything

Barrels are allowed only when they remain lightweight and tree-shakeable.

---

### 5.5 Split optional features into separate entrypoints

Examples:

- replay tooling
- persistence adapters
- provider plugins

Must be importable on demand.

---

### 5.6 Avoid dynamic runtime module loading

Avoid patterns that break tree-shaking:

- dynamic `require()`
- reflection-driven handler discovery

---

### 5.7 Export types using `export type`

Ensure type-only exports do not affect runtime bundles.

---

## 6. Core Package Folder Discipline

`packages/core` must remain modular by domain:

```
runtime/
context/
plugins/
persistence/
retry/
replay/
errors/
utils/
```

Do not collapse these into a single large module.

Convenience entrypoints must remain thin.

---

## 7. API Design Rules

### 7.1 Public API surface must stay minimal

Prefer:

- small config objects
- explicit naming
- predictable lifecycle

Avoid:

- polymorphic magic APIs
- speculative generic abstractions

---

### 7.2 Context (`ctx`) must remain provider-agnostic

Provider typing should live in plugin layers, not in core runtime contracts.

---

### 7.3 Do not expose premature abstractions

Avoid introducing public concepts like:

- generic Store interfaces
- driver negotiation systems
- middleware pipelines

unless they are part of agreed product direction.

---

## 8. Testing Rules

### 8.1 Runtime-critical behaviour must have tests

Test scenarios must include:

- event ingestion
- execution lifecycle
- step checkpoint skipping
- retry scheduling
- replay correctness
- resume correctness

---

### 8.2 Tests must be deterministic

Avoid:

- real network calls
- uncontrolled time
- randomness without seeding

Use controlled clocks and mocks.

---

## 9. Observability & Error Rules

- Execution failures must always be persisted.
- Logs must include execution id, event id, provider, and step where applicable.
- Avoid vague log messages without metadata.

---

## 10. Agent Behaviour Rules

### 10.1 Do not silently redesign architecture

If implementation friction suggests architectural change:

- pause
- propose revision
- update docs first

---

### 10.2 Do not weaken durability guarantees for convenience

Never:

- skip persistence
- process webhook logic inline
- ignore verification failures

---

### 10.3 Optimize for boring reliability

RelayOS should feel:

- predictable
- inspectable
- operationally safe

---

## 11. Change Governance

Add or modify rules when:

- the same constraint appears repeatedly
- future contributors would otherwise make the same mistake
- packaging/runtime decisions become stable

If code and this file diverge:

> update one immediately so there is a single source of truth.

---

### Final Guiding Principle

When unsure, choose the implementation that is:

1. More explicit
2. More deterministic
3. Easier to inspect
4. Easier to replay
5. Less magical

That is the RelayOS engineering standard.
