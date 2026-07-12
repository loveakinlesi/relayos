# relayos

**Durable, replayable webhook execution for TypeScript backends.** `ctx.step.run()` checkpoints each unit of work — a retry resumes past whatever already succeeded and never re-runs a completed step's side effects.

```sh
pnpm add relayos @relayos/postgres @relayos/stripe stripe @relayos/nextjs
```

```ts
// relayos.config.ts
import { createRelay } from 'relayos';
import { stripe } from '@relayos/stripe';
import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

const db = createDb(process.env.DATABASE_URL!);

export const relay = createRelay({
  database: createPostgresExecutionStore(db),
  plugins: [stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })],
});

relay.on('stripe.charge.succeeded', async (event, ctx) => {
  const charge = event.data.object; // a fully-typed Stripe.Charge

  const payment = await ctx.step.run('record-payment', async () => {
    return { chargeId: charge.id, amount: charge.amount };
  });

  await ctx.step.run('send-receipt', async () => {
    await sendReceiptEmail(payment);
  });
});
```

```ts
// app/api/relay/[...all]/route.ts (Next.js)
import { toNextJsHandler } from '@relayos/nextjs';
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
```

If `send-receipt` fails, the execution retries automatically with exponential backoff — and `record-payment` never runs twice.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the quickstart, concepts, and full API reference.
