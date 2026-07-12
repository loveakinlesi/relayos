# relayos

**Durable, replayable webhook execution for TypeScript backends.** `ctx.step.run()` checkpoints each unit of work — a retry resumes past whatever already succeeded and never re-runs a completed step's side effects.

```sh
pnpm add relayos better-sqlite3
```

Next.js support (`relayos/next-js`) ships in this package - nothing extra to install for that. Database support (Postgres/SQLite/MySQL, auto-detected) lives in `@relayos/core`, pulled in automatically. Add `@relayos/stripe` or `@relayos/github` only once you need them.

```ts
// relay.ts — wiring only: storage, plugins, retry policy
import { relayos } from 'relayos';
import Database from 'better-sqlite3';
import { registerHandlers } from './relay.handlers';

export const relay = relayos({ database: new Database('relay.db') });
export type AppRelay = typeof relay; // carries the typed event catalog forward
registerHandlers(relay);
```

```ts
// relay.handlers.ts — handler logic lives here, not in relay.ts
import type { AppRelay } from './relay';

export function registerHandlers(relay: AppRelay): void {
  relay.on('order.placed', async (event, ctx) => {
    const payment = await ctx.step.run('charge-payment', async () => {
      return { orderId: event.data.orderId, amount: event.data.amount };
    });

    await ctx.step.run('send-confirmation', async () => {
      ctx.log.info('order confirmed', payment);
    });
  });
}
```

```ts
// app/api/relay/[...all]/route.ts (Next.js — nothing extra to install)
import { toNextJsHandler } from 'relayos/next-js';
import { relay } from '@/relay';

export const { POST } = toNextJsHandler(relay);
```

If `charge-payment` fails, the execution retries automatically with exponential backoff — steps that already completed never re-run.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the installation guide, basic usage, concepts, and full API reference.
