# relayos

**Durable, replayable webhook execution for TypeScript backends.** `ctx.step.run()` checkpoints each unit of work — a retry resumes past whatever already succeeded and never re-runs a completed step's side effects.

```sh
pnpm add relayos
```

That's the entire install — in-memory storage and Next.js support (`relayos/next-js`) ship in this package. Add `@relayos/postgres`, `@relayos/stripe`, or `@relayos/github` only once you need them.

```ts
// relayos.config.ts — wiring only: storage, plugins, retry policy
import { createRelay } from 'relayos';
import { registerHandlers } from './relayos.handlers';

export const relay = createRelay();
export type AppRelay = typeof relay; // carries the typed event catalog forward
registerHandlers(relay);
```

```ts
// relayos.handlers.ts — handler logic lives here, not in relayos.config.ts
import type { AppRelay } from './relayos.config';

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
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
```

If `charge-payment` fails, the execution retries automatically with exponential backoff — steps that already completed never re-run.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the quickstart, concepts, and full API reference.
