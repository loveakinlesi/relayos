# RelayOS Plugin System

## Purpose of this Document

RelayOS is designed to be **provider-agnostic at its core**.

All external webhook providers (Stripe, GitHub, Slack, etc.) integrate
through a structured plugin system.

This document defines:

- the plugin architecture
- lifecycle contracts
- event normalization rules
- handler registration model
- tree-shaking guarantees
- extensibility philosophy

It is required reading for anyone building a RelayOS provider plugin.

---

## Plugin Philosophy

RelayOS plugins exist to solve three problems:

1. Signature verification
2. Event normalization
3. Developer-friendly handler ergonomics

Core runtime should **never contain provider logic**.

Plugins act as a translation layer between:

> Raw HTTP webhook payloads → Durable RelayOS events.

---

## Plugin Responsibilities

A plugin must implement the following responsibilities.

### 1. Webhook Verification

Each plugin is responsible for verifying authenticity of incoming requests.

Typical verification tasks:

- HMAC signature validation
- timestamp tolerance checks
- provider-specific header parsing
- raw body integrity verification

Verification must occur **before event persistence**.

If verification fails:

- plugin throws a verification error
- runtime responds with appropriate HTTP status
- event is not stored

---

### 2. Event Normalization

Plugins convert raw payloads into a normalized RelayOS event format.

Normalization produces:

- provider identifier
- canonical event name
- typed payload object
- raw payload snapshot
- verification metadata

Example normalized structure:

```jsonc
{
provider: "stripe",
eventName: "payment_intent.succeeded",
payload: <typed object>,
rawPayload: <json>,
receivedAt: Date
}
```

Normalization must be **pure and deterministic**.

Plugins must not:

- execute side-effects
- mutate payload data unpredictably
- depend on runtime execution state

---

### 3. Handler Registration

Plugins expose developer-friendly handler registration APIs.

Two handler styles are supported.

#### Semantic Handlers (Recommended)

Example:

```ts
stripe({
  onPaymentIntentSucceeded: async (ctx) => {},
  onChargeFailed: async (ctx) => {},
});
```

These provide:

- better DX
- improved discoverability
- tree-shakable event bundles
- typed payload guarantees

#### Raw Event Handler (Fallback)

Example:

```ts
stripe({
  onEvent: async (ctx) => {},
});
```

This handler receives:

- normalized event metadata
- raw typed payload union

Used for:

- unsupported events
- debugging
- experimental flows

---

### 4. Event Routing Metadata

Plugins must provide event routing metadata describing:

- supported event names
- semantic handler mapping
- payload type mapping
- optional event priority hints

This metadata allows the runtime to:

- dispatch executions efficiently
- perform compile-time tree-shaking
- validate plugin configuration

---

## Plugin Registration Lifecycle

Plugins are registered during RelayOS initialization.

Example:

```ts
import { relayos } from "relayos";

const relay = relayos({
  database: {
    connectionString: process.env.DATABASE_URL!,
    schema: "relayos",
  },
  plugins: [stripe(), github()],
});
```

During registration the runtime:

1. validates plugin identity
2. loads event routing table
3. registers verification strategy
4. registers handler factories

Plugins must remain **stateless after registration**.

---

## Plugin Instance Isolation

Each plugin instance should:

- hold provider configuration (secrets, client instances)
- expose handler factories
- remain execution-agnostic

Plugins must never:

- store execution state internally
- maintain retry counters
- implement persistence logic

All durable state belongs to the core runtime.

---

## Execution Handler Contract

When an execution begins, the runtime resolves:

- plugin → event mapping
- handler → execution context binding

The plugin provides:

```ts
async function handler(ctx) { ... }
```

The runtime provides:

- deterministic execution lifecycle
- retry orchestration
- step checkpoint persistence

Plugins must assume:

> handlers may run multiple times due to retries.

---

## Tree-Shaking Guarantees

RelayOS plugins must be designed for optimal bundle elimination.

To achieve this:

- each semantic event handler should be exported independently
- event handler registration should be static-analysis friendly
- avoid dynamic event name maps where possible
- avoid runtime reflection-heavy registration

Example pattern:

```ts
export function onPaymentIntentSucceeded(handler) {}
export function onChargeFailed(handler) {}
```

Then aggregated by plugin factory.

This ensures:

- unused event handlers are removed by bundlers
- serverless deployments stay lightweight
- plugin ecosystem scales efficiently

---

## Secret Resolution Strategy

Plugins should support automatic secret discovery.

Resolution order:

1. Explicit configuration passed to plugin
2. Environment variable convention  
   Example: `STRIPE_WEBHOOK_SECRET`
3. Runtime configuration provider (future)

If no secret is resolved:

- plugin should emit startup warning or throw initialization error

This prevents silent insecure deployments.

---

## Plugin Error Handling

Plugins should throw structured errors for:

- signature verification failure
- malformed payload parsing
- unsupported event version
- configuration issues

Core runtime will:

- classify errors
- decide retry eligibility
- update execution state

Plugins should not implement retry logic.

---

## Custom Plugin Extensibility

RelayOS encourages developers to build internal provider plugins.

A custom plugin should implement:

- verification strategy
- normalization adapter
- handler registration interface

Minimal plugin surface keeps ecosystem approachable.

---

## Versioning Philosophy

Plugins should follow:

- independent semantic versioning
- provider API compatibility awareness
- payload typing version alignment

Breaking provider payload changes should trigger:

- plugin major version bump
- typed payload migration guidance

---

## Summary

RelayOS plugins form the **integration boundary** between
external webhook providers and the deterministic runtime.

They are responsible for:

- trust verification
- event translation
- developer ergonomics

They are intentionally **not responsible for execution reliability**.

This separation allows RelayOS to evolve into a robust
event execution platform with a scalable plugin ecosystem.
