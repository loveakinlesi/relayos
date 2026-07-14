# @relayos/shopify

The RelayOS Shopify plugin: `X-Shopify-Hmac-Sha256` verification against the raw request body, plus typed RelayOS event names for common Shopify topics.

```sh
pnpm add @relayos/shopify
```

```ts
// relay.ts - wiring only
import { relayos } from 'relayos';
import { shopify } from '@relayos/shopify';
import { registerHandlers } from './relay.handlers';

export const relay = relayos({
  plugins: [shopify()], // reads SHOPIFY_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof relay;
registerHandlers(relay);
```

```ts
// relay.handlers.ts
import type { AppRelay } from './relay';

export function registerHandlers(relay: AppRelay): void {
  relay.on('shopify.orders.create', async (event, ctx) => {
    ctx.log.info('order created', { id: event.data.id });
  });
}
```

Point your Shopify webhook endpoint at `/api/webhook/shopify`. Shopify topics are normalized from slash-separated topics to dots (`orders/create` becomes `shopify.orders.create`).
