export const RELAYOS_CONFIG_TEMPLATE = `import { createRelay } from 'relayos';
// import { stripe } from 'relayos/plugins/stripe';
// import { github } from 'relayos/plugins/github';
// import { createDb, createPostgresExecutionStore } from '@relayos/postgres';

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

// Register a handler for each event you care about:
//
// relay.on('stripe.charge.succeeded', async (event, ctx) => {
//   const charge = event.data['object'] as { id: string; amount: number };
//
//   const payment = await ctx.step.run('record-payment', async () => {
//     return { chargeId: charge.id, amount: charge.amount };
//   });
//
//   ctx.log.info('payment recorded', payment);
// });
`;

export const INIT_NEXT_STEPS = `
Next steps:
  1. Wire relayos.config.ts into your framework. For Next.js:

       import { toNextJsHandler } from 'relayos/next-js';
       import { relay } from './relayos.config';
       export const { POST } = toNextJsHandler(relay);

  2. Uncomment a plugin and register a handler with relay.on(...).
  3. When you're ready for persistence, uncomment the Postgres lines,
     create a database, and run:
       DATABASE_URL=<your-db> relay migrate
`;
