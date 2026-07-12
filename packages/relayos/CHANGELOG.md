# relayos

## 0.1.0

### Minor Changes

- e560c6a: Restructure RelayOS into independently published packages with typed event catalogs.
  - `@relayos/core` — the engine (durable executions, steps, retries, replay, dedup) and every shared contract, plus typed event-map inference: `createRelay` infers event types from the registered plugins.
  - `relayos` — the SDK surface (`createRelay` + user-facing types), now a thin layer over `@relayos/core`.
  - `@relayos/plugin` — plugin authoring kit: `definePlugin` and the HMAC signature helpers.
  - `@relayos/stripe` — the Stripe plugin with a fully-typed catalog of every Stripe event (typed from the `stripe` package, now a peer dependency).
  - `@relayos/github` — the GitHub plugin with a fully-typed catalog of every GitHub webhook event (typed from `@octokit/webhooks-types`).
  - `@relayos/nextjs` — `toNextJsHandler`, moved out of `relayos/next-js`.
  - `@relayos/postgres` — now depends on `@relayos/core` (peer) instead of `relayos`.
  - `@relayos/cli` — `relay init` scaffolds the new import style; provider factories come from `@relayos/stripe` / `@relayos/github`.

  Breaking import changes from the pre-split layout: `relayos/plugins/stripe` → `@relayos/stripe`, `relayos/plugins/github` → `@relayos/github`, `relayos/next-js` → `@relayos/nextjs`.

### Patch Changes

- Updated dependencies [e560c6a]
  - @relayos/core@0.1.0
