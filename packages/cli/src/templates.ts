export const RELAYOS_CONFIG_TEMPLATE = `import { createRelay } from 'relayos';
// import { stripe } from '@relayos/stripe';
// import { github } from '@relayos/github';
// import { createDb, createPostgresExecutionStore } from '@relayos/postgres';
import { registerHandlers } from './relayos.handlers';

export const relay = createRelay({
  // Executions are kept in memory by default - fine for getting started, but
  // they won't survive a restart. Swap in Postgres once you're ready:
  //
  //   const db = createDb(process.env.DATABASE_URL!);
  //   database: createPostgresExecutionStore(db),

  plugins: [
    // stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! }),
    // github({ webhookSecret: process.env.GITHUB_WEBHOOK_SECRET! }),
  ],
});

// The concrete relay type, including the typed event catalog inferred from
// the plugins above - exported so relayos.handlers.ts (or any other module)
// can register handlers with full event.data typing, without needing to
// duplicate the plugins list.
export type AppRelay = typeof relay;

registerHandlers(relay);
`;

export const RELAYOS_HANDLERS_TEMPLATE = `import type { AppRelay } from './relayos.config';

// Handlers live here, not in relayos.config.ts - that file stays
// wiring-only (storage, plugins, retry policy), while the business logic
// that runs when an event arrives lives in its own module. For a larger
// app, split this across multiple files (e.g. one per feature) and call
// each from registerHandlers.
export function registerHandlers(relay: AppRelay): void {
  // Events from @relayos provider plugins are fully typed - relay.on()
  // autocompletes their event names and types event.data per event:
  //
  // relay.on('stripe.charge.succeeded', async (event, ctx) => {
  //   const charge = event.data.object; // a typed Stripe.Charge
  //
  //   const payment = await ctx.step.run('record-payment', async () => {
  //     return { chargeId: charge.id, amount: charge.amount };
  //   });
  //
  //   ctx.log.info('payment recorded', payment);
  // });
}
`;

export const INIT_NEXT_STEPS = `
Next steps:
  1. relayos.config.ts and relayos.handlers.ts work as-is right now -
     in-memory, no plugins, no framework wiring required. Add a
     relay.on(...) call inside registerHandlers() and call relay.ingest(...)
     to try it.
  2. Mounting behind a webhook endpoint is optional and framework-specific.
     Next.js support ships in relayos itself - nothing extra to install.
     In app/api/relay/[...all]/route.ts:

       import { toNextJsHandler } from 'relayos/next-js';
       import { relay } from '@/relayos.config';
       export const { POST } = toNextJsHandler(relay);

  3. Only install a provider plugin once you're ready to receive its real
     webhooks (pnpm add @relayos/stripe stripe, or @relayos/github) -
     uncomment it in relayos.config.ts.
  4. When you're ready for durability across restarts, install
     @relayos/postgres, uncomment the Postgres lines, create a database,
     and run:
       DATABASE_URL=<your-db> relay migrate
`;
