# RelayOS — Project Overview

## Vision

RelayOS is a deterministic webhook execution platform designed to make webhook processing reliable, observable, and developer-friendly.

Modern applications depend heavily on external event providers such as:

- Stripe
- GitHub
- Slack
- Resend
- Payment gateways
- Internal microservices

However, webhook handling today is typically:

- fragile
- untyped
- difficult to test locally
- hard to retry safely
- prone to duplicate processing
- difficult to debug in production

RelayOS aims to provide a **durable execution runtime for webhooks**, similar in spirit to workflow engines like Temporal, but focused specifically on event-driven backend development.

---

## Core Philosophy

RelayOS is built around five principles:

### 1. Deterministic Execution

Webhook handlers should behave like replayable workflows, not one-shot request handlers.

RelayOS ensures:

- execution state is persisted
- failed executions can be replayed
- partial progress can be resumed
- side-effects are checkpointed

### 2. Step-Level Idempotency

Developers define logical steps using:

```ts
await ctx.step("step-name", async () => { ... })
```

RelayOS guarantees:

- completed steps are never re-executed
- retries only run unfinished work
- workflows become naturally safe and restartable

### 3. Reliable Retries

RelayOS provides built-in retry orchestration:

- configurable retry policies
- exponential backoff support
- persistent retry scheduling
- crash-safe execution continuation

This removes the need for developers to manually build retry queues.

### 4. Deterministic Replay

Developers can replay webhook executions:

- to debug production failures
- to test new handler logic
- to simulate historical events
- to recover from infrastructure incidents

Replay runs in a new execution chain while preserving history.

### 5. Developer-First Experience

RelayOS prioritises developer productivity through:

- local event simulation
- structured execution inspection
- typed provider plugins
- minimal framework integration friction

The goal is to make webhook development feel predictable and testable.

---

## Architecture Overview

RelayOS is structured as a modular runtime platform.

### Core Runtime (`relayos/core`)

Responsible for:

- execution orchestration
- concurrency control
- step checkpoint lifecycle
- retry scheduling
- replay and resume control
- plugin execution coordination

The core runtime is framework-agnostic and provider-agnostic.

### Root SDK (`relayos`)

Provides:

- ergonomic developer entry point
- runtime factory helpers
- default configuration wiring
- future high-level utilities

This package keeps the public API surface simple.

### Provider Plugins (`relayos/*`)

Each provider plugin handles:

- signature verification
- event parsing
- normalized event mapping
- semantic event handlers

Example future plugins:

- `relayos/stripe`
- `relayos/github`
- `relayos/slack`

### Framework Adapters (`relayos/*`)

Framework integrations bridge HTTP servers to the RelayOS runtime.

Examples:

- `relayos/nestjs`
- `relayos/nextjs`
- `relayos/hono`

These adapters translate incoming webhook requests into normalized events for the core engine.

### CLI Tooling (`relayos/cli`)

Developer tooling enables:

- database migrations
- local event simulation
- execution replay
- runtime inspection

This layer is key to RelayOS's developer experience advantage.

---

## Persistence Strategy (v1)

RelayOS v1 is **Postgres-first**.

The runtime:

- uses the application's existing database
- manages its own isolated schema
- persists events, executions, steps, and retries

Future versions may introduce additional persistence drivers.

---

## Execution Model

Each webhook follows a structured lifecycle:

1. Event received
2. Event persisted
3. Execution created
4. Handler invoked
5. Steps checkpointed
6. Execution succeeds or schedules retry

This model ensures:

- visibility into processing state
- safe recovery after failure
- deterministic behaviour across environments

---

## Non-Goals (v1)

RelayOS v1 intentionally avoids:

- distributed worker coordination
- multi-database drivers
- parallel workflow DAG execution
- horizontal scaling orchestration
- advanced scheduling strategies

These may be introduced after validating core runtime stability.

---

## Long-Term Direction

RelayOS aims to evolve into a general event execution platform capable of:

- powering event-driven microservices
- orchestrating background workflows
- simplifying external system integrations
- enabling AI-assisted backend automation

The initial focus remains: **building the most reliable and developer-friendly webhook runtime.**
