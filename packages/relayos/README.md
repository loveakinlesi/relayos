# relayos

Thin public SDK wrapper for RelayOS.

## Purpose

This package provides the ergonomic application-facing entrypoint:

```ts
import { relayos } from "relayos";
```

It wraps `relayos/core` and can auto-load application config from `relayos.config.ts`.

## Usage

```ts
import { relayos, defineRelayConfig } from "relayos";

export default defineRelayConfig({
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

Then start the runtime from your app:

```ts
import { relayos } from "relayos";

const relay = await relayos();
```

You can still construct the runtime directly with `relayos({...})` if you do not want config auto-loading.

## Exports

- `relayos()`
- `defineRelayConfig()`
- `RelayPlugin`
- `RelayConfig`
- `IncomingWebhook`
- `ExecutionContext`
- `ExecutionStatus`
- `StepStatus`
- `RelayOSOptions`

For lower-level runtime internals, use `relayos/core` directly.
