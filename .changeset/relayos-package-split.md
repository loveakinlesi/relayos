---
'relayos': minor
'@relayos/core': minor
'@relayos/plugin': minor
'@relayos/stripe': minor
'@relayos/github': minor
'@relayos/postgres': minor
'@relayos/cli': minor
---

Restructure RelayOS into independently published packages with typed event catalogs, a zero-dependency quickstart, and Next.js support built in.

- `@relayos/core` — the engine (durable executions, steps, retries, replay, dedup) and every shared contract, plus typed event-map inference: `createRelay` infers event types from the registered plugins.
- `relayos` — the SDK surface (`createRelay` + user-facing types) and the Next.js adapter (`relayos/next-js`), now a thin layer over `@relayos/core`. In-memory storage by default - no database or provider plugin required to get started.
- `@relayos/plugin` — plugin authoring kit: `definePlugin` and the HMAC signature helpers.
- `@relayos/stripe` — the Stripe plugin with a fully-typed catalog of every Stripe event (typed from the `stripe` package, now a peer dependency). Optional - install only if you're receiving Stripe webhooks.
- `@relayos/github` — the GitHub plugin with a fully-typed catalog of every GitHub webhook event (typed from `@octokit/webhooks-types`). Optional - install only if you're receiving GitHub webhooks.
- `@relayos/postgres` — now depends on `@relayos/core` (peer) instead of `relayos`. Optional - install only when you need durability across restarts.
- `@relayos/cli` — `relay init` now scaffolds two files: `relayos.config.ts` (wiring only - storage, plugins, retry policy) and `relayos.handlers.ts` (a `registerHandlers(relay)` function, so handler logic doesn't live in the config file). Provider factories come from `@relayos/stripe` / `@relayos/github`.

Breaking import changes from the pre-split layout: `relayos/plugins/stripe` → `@relayos/stripe`, `relayos/plugins/github` → `@relayos/github`. The Next.js adapter stays at `relayos/next-js` (it was briefly split into `@relayos/nextjs` and has been folded back in, matching Better Auth's pattern of shipping framework adapters as subpath exports of the core package rather than separate packages).
