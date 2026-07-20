# @restaq/core

The Restaq engine: durable executions, idempotent steps, automatic retries, replay/restart, database support (Postgres/SQLite/MySQL, auto-detected, built on [Kysely](https://kysely.dev)), and the contracts (`ExecutionStore`, `RelayPlugin`, `NormalizedEvent`) every Restaq package builds on.

Most applications should install [`restaq`](https://www.npmjs.com/package/restaq) (the SDK) instead — it re-exports everything user-facing from this package. Depend on `@restaq/core` directly when you're building a storage adapter, a provider plugin, or a framework integration.

```sh
pnpm add @restaq/core
```

```ts
import { createRelayEngine } from '@restaq/core';
import type { ExecutionStore, RelayPlugin, NormalizedEvent } from '@restaq/core';
```

See the [Restaq documentation](https://github.com/loveakinlesi/restaq#readme) for guides and the full API reference.
