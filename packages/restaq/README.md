# restaq

**Durable, replayable webhook execution for TypeScript backends.** `ctx.step.run()` checkpoints each unit of work — a retry resumes past whatever already succeeded and never re-runs a completed step's side effects.

```sh
pnpm add restaq better-sqlite3
```

Framework adapters (`restaq/next-js`, `restaq/express`, `restaq/hono`, `restaq/nestjs`) and the `relay` CLI ship in this package - nothing extra to install for either. Database support (Postgres/SQLite/MySQL, auto-detected) lives in `@restaq/core`, pulled in automatically. Add provider plugins like `@restaq/stripe`, `@restaq/github`, `@restaq/clerk`, `@restaq/shopify`, or `@restaq/resend` only once you need them.

No project yet? `npx restaq@latest init` scaffolds one with nothing pre-installed.

```ts
// relay.ts — wiring only: storage, plugins, retry policy
import { restaq as createRestaq } from 'restaq';
import Database from 'better-sqlite3';
import { registerHandlers } from './relay.handlers';

export const restaq = createRestaq({ database: new Database('restaq.db') });
export type AppRelay = typeof restaq; // carries the typed event catalog forward
registerHandlers(restaq);
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
// app/api/webhook/[...all]/route.ts (Next.js — nothing extra to install)
import { toNextJsHandler } from 'restaq/next-js';
import { restaq } from '@/relay';

export const { POST } = toNextJsHandler(restaq);
```

If `charge-payment` fails, the execution retries automatically with exponential backoff — steps that already completed never re-run.

See the [Restaq documentation](https://github.com/loveakinlesi/restaq#readme) for the installation guide, basic usage, concepts, and full API reference.
