# relayos

Thin public SDK wrapper for RelayOS.

## Purpose

This package provides the ergonomic application-facing entrypoint:

```ts
import { relayos } from "relayos";
```

It wraps `relayos/core` without changing runtime behavior.

## Usage

```ts
import { relayos } from "relayos";

const relay = relayos({
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
  plugins: [stripe(), github()],
});
```

## Exports

- `relayos()`
- `RelayPlugin`
- `RelayConfig`
- `IncomingWebhook`
- `ExecutionContext`
- `ExecutionStatus`
- `StepStatus`
- `RelayOSOptions`

For lower-level runtime internals, use `relayos/core` directly.
