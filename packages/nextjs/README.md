# @relayos/nextjs

The RelayOS Next.js adapter: mount a relay's webhook handler as an App Router catch-all route.

```sh
pnpm add @relayos/nextjs
```

```ts
// app/api/relay/[...all]/route.ts
import { toNextJsHandler } from '@relayos/nextjs';
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
```

Each registered plugin is served under its id: Stripe at `/api/relay/stripe`, GitHub at `/api/relay/github`. The adapter uses only web-standard `Request`/`Response` (no `next` import), so it works in any Next.js runtime.

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the full quickstart.
