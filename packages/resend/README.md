# @restaq/resend

The Restaq Resend plugin: Svix-style webhook verification against the raw request body, plus typed Restaq event names for Resend email events.

```sh
pnpm add @restaq/resend
```

```ts
// relay.ts - wiring only
import { restaq } from 'restaq';
import { resend } from '@restaq/resend';
import { registerHandlers } from './relay.handlers';

export const relay = restaq({
  plugins: [resend()], // reads RESEND_WEBHOOK_SECRET automatically
});
export type AppRelay = typeof relay;
registerHandlers(relay);
```

```ts
// relay.handlers.ts
import type { AppRelay } from './relay';

export function registerHandlers(relay: AppRelay): void {
  relay.on('resend.email.delivered', async (event, ctx) => {
    ctx.log.info('email delivered', { id: event.data.email_id });
  });
}
```

Point your Resend webhook endpoint at `/api/webhook/resend`. Events are namespaced `resend.<event type>` (`resend.email.sent`, `resend.email.delivered`, ...). Signatures are verified with a timestamp tolerance of 300 seconds by default (`toleranceSeconds` option).
