# @relayos/stripe

The RelayOS Stripe plugin: real `stripe-signature` HMAC verification against the raw request body, plus a fully-typed catalog of every Stripe webhook event derived from the official `stripe` package.

```sh
pnpm add @relayos/stripe stripe
```

`stripe` is a peer dependency — the typed event catalog tracks whichever Stripe SDK version your application has installed.

```ts
// relayos.config.ts — wiring only
import { createRelay } from 'relayos';
import { stripe } from '@relayos/stripe';
import { registerHandlers } from './relayos.handlers';

export const relay = createRelay({
  plugins: [stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })],
});
export type AppRelay = typeof relay;
registerHandlers(relay);
```

```ts
// relayos.handlers.ts — handler logic lives here, not in relayos.config.ts
import type { AppRelay } from './relayos.config';

export function registerHandlers(relay: AppRelay): void {
  relay.on('stripe.charge.succeeded', async (event, ctx) => {
    const charge = event.data.object; // Stripe.Charge - typed, autocompletes
    ctx.log.info('paid', { id: charge.id, amount: charge.amount });
  });
}
```

Point your Stripe webhook endpoint at `/api/relay/stripe`. Events are namespaced `stripe.<event type>` (`stripe.invoice.paid`, `stripe.customer.subscription.created`, …). Signatures are verified with a timestamp tolerance of 300 seconds by default (`toleranceSeconds` option).

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for guides.
