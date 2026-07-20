# @restaq/shopify

The Restaq Shopify plugin: `X-Shopify-Hmac-Sha256` verification against the raw request body, plus typed Restaq event names for common Shopify topics.

```sh
pnpm add @restaq/shopify
```

```ts
// relay.ts - wiring only
import { restaq as createRestaq } from 'restaq';
import { shopify } from '@restaq/shopify';
import { registerHandlers } from './relay.handlers';

export const restaq = createRestaq({
  plugins: [shopify()], // reads SHOPIFY_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof restaq;
registerHandlers(restaq);
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
