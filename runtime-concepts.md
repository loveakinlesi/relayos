# RelayOS Runtime Concepts

## Purpose of this Document

RelayOS introduces a new mental model for webhook processing.

Traditional webhook systems execute logic directly inside HTTP handlers.
RelayOS instead treats each webhook as a **durable workflow execution**.

This document explains the **core runtime concepts** required to understand,
extend, and safely contribute to the RelayOS engine.

---

## Core Mental Model

RelayOS processes webhooks using four fundamental runtime primitives:

- Event
- Execution
- Step
- Retry Cycle

Understanding how these relate is essential.

A simple way to think about the runtime:

> A webhook **event** creates an **execution**.  
> An execution runs a sequence of **steps**.  
> If failure occurs, the execution enters a **retry cycle**.

---

## Event

An **Event** represents a single webhook notification received from a provider.

Examples:

- Stripe `payment_intent.succeeded`
- GitHub `push`
- Slack `message.channels`

Events are:

- immutable
- uniquely identifiable
- stored permanently
- provider-normalized

An event does **not** contain execution state.

It only describes:

- who sent the webhook
- what type of event occurred
- the raw payload data
- reception metadata

Think of an Event as:

> "A fact that happened in the outside world."

---

## Execution

An **Execution** represents an attempt to process an Event.

Key properties:

- Multiple executions can exist for a single event
- Each execution has lifecycle state
- Executions track retry attempts
- Executions own step progress

Execution states include:

- pending
- running
- completed
- failed
- retrying
- cancelled

Executions are **workflow instances**, not HTTP requests.

Think of an Execution as:

> "A worker trying to handle the event."

---

## Step

A **Step** is the smallest durable unit of work inside an execution.

Developers define steps using:

```ts
await ctx.step("send-email", async () => {
  // side effect
});
```

Steps provide:

- idempotent progress tracking
- replay safety
- retry safety
- execution observability

Step characteristics:

- identified by developer-defined name
- persisted independently
- executed sequentially
- never re-executed once completed

Steps exist because webhook workflows almost always involve multiple side-effects, and partial success must be recoverable.

Think of a Step as:

> "A checkpoint in the workflow."

---

## Retry Cycle

A **Retry Cycle** begins when an execution fails before completing all steps.

RelayOS handles retries automatically using:

- configured retry policy
- backoff strategy
- persisted retry schedule

Retry behaviour:

- a new execution attempt is created
- step completion history is preserved
- completed steps are skipped
- only unfinished work executes

Retry cycles continue until:

- execution completes successfully
- retry attempts are exhausted
- execution is manually cancelled

Think of a Retry Cycle as:

> "The system trying again safely."

---

## Replay vs Resume

These two concepts are often confused, but they represent different forms of recovery.

### Replay

**Replay** creates a new execution chain for an existing event.

Use replay when:

- business logic changed
- a bug was fixed in a handler
- a historical event needs reprocessing

Replay characteristics:

- does not modify original executions
- creates new execution attempts
- can optionally ignore previous step state

Replay is a developer or operator action.

### Resume

**Resume** continues a failed execution.

Use resume when:

- retry attempts were paused
- a system crash occurred
- manual intervention was required

Resume characteristics:

- uses the same execution record
- continues from the last incomplete step
- preserves retry attempt count

Resume is a recovery action.

---

## Deterministic Execution Principle

RelayOS enforces a deterministic execution philosophy:

- Steps must be logically idempotent
- Side-effects must live inside steps
- Non-deterministic logic should be minimized
- Execution behaviour must be reproducible

This ensures:

- replay safety
- retry correctness
- predictable debugging outcomes

---

## Execution Queue

RelayOS processes executions via an in-memory queue.

Queue responsibilities:

- enforce concurrency limits
- prevent uncontrolled parallelism
- manage execution scheduling
- release capacity on completion or failure

Queue guarantees:

- executions run independently
- steps run sequentially within an execution
- retry executions re-enter the queue

---

## Event Normalization

Provider plugins convert raw webhook payloads into:

- normalized provider id
- normalized event name
- typed payload object
- signature verification metadata

The core runtime never processes raw HTTP payloads.

This separation allows:

- plugin extensibility
- clean execution orchestration
- provider-agnostic runtime logic

---

## Execution Context (`ctx`)

Handlers receive a runtime context object.

The context represents:

- execution metadata
- step control primitives
- retry control primitives
- structured logging utilities
- normalized payload access

Context is ephemeral per execution run, but backed by persistent execution state.

---

## Failure Philosophy

RelayOS assumes failure is normal in distributed webhook systems.

Common failure sources:

- network timeouts
- provider rate limiting
- downstream API outages
- database contention
- deployment restarts

Therefore the runtime is designed to:

- tolerate partial completion
- safely retry work
- preserve execution traceability
- enable deterministic recovery

---

## Observability Model

RelayOS exposes progress at three levels:

- Event level
- Execution level
- Step level

This layered visibility allows:

- debugging production failures
- building execution dashboards
- safe manual recovery workflows
- performance analysis

---

## Summary

RelayOS runtime is built around a durable workflow philosophy:

- Events describe what happened
- Executions describe attempts to handle it
- Steps describe progress checkpoints
- Retry cycles describe resilience behaviour

By enforcing these concepts consistently, RelayOS transforms webhook processing into a reliable execution system suitable for modern distributed backend architectures.
