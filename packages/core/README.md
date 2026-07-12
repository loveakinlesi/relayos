# @relayos/core

The RelayOS engine: durable executions, idempotent steps, automatic retries, replay/restart, database support (Postgres/SQLite/MySQL, auto-detected, built on [Kysely](https://kysely.dev)), and the contracts (`ExecutionStore`, `RelayPlugin`, `NormalizedEvent`) every RelayOS package builds on.

Most applications should install [`relayos`](https://www.npmjs.com/package/relayos) (the SDK) instead — it re-exports everything user-facing from this package. Depend on `@relayos/core` directly when you're building a storage adapter, a provider plugin, or a framework integration.

```sh
pnpm add @relayos/core
```

```ts
import { createRelayEngine } from '@relayos/core';
import type { ExecutionStore, RelayPlugin, NormalizedEvent } from '@relayos/core';
```

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for guides and the full API reference.
