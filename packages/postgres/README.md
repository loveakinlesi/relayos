# @relayos/postgres

The RelayOS Postgres storage adapter: Drizzle schema, migrations, and the `ExecutionStore` implementation. RelayOS's tables live in a dedicated `relayos` Postgres schema, so they never collide with your application's own tables.

```sh
pnpm add @relayos/postgres
```

```ts
import { createRelay } from 'relayos';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const db = createDb(process.env.DATABASE_URL!);

export const relay = createRelay({
  database: createPostgresExecutionStore(db),
});
```

Apply migrations with the CLI (or `runMigrations(db)` programmatically):

```sh
DATABASE_URL=postgres://localhost:5432/myapp pnpm exec relay migrate
```

Event dedup uses an atomic `INSERT ... ON CONFLICT DO NOTHING`, so concurrent redeliveries of the same webhook collapse to a single execution even across processes.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for guides.
