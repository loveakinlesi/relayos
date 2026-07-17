# Changelog

All notable changes to RelayOS are documented here. Entries below this point are generated automatically by [semantic-release](https://github.com/semantic-release/semantic-release) from commit history.

## 0.1.0 (2026-07-16)

First public pre-release. Every package in the `@relayos/*` scope, plus `relayos` itself, ships as `0.1.0` and moves in lockstep from here on.

### Features

- **core:** durable executions, steps, retries, replay, and dedup, plus typed event-map inference — `createRelay` infers event types from the registered plugins.
- **relayos:** the SDK surface (`createRelay` + user-facing types) and the Next.js adapter (`relayos/next-js`), a thin layer over `@relayos/core`. In-memory storage by default — no database or provider plugin required to get started.
- **plugin:** plugin authoring kit (`definePlugin` and the HMAC signature helpers) for anyone writing a custom provider integration.
- **stripe:** fully-typed catalog of every Stripe event, typed from the `stripe` package (peer dependency).
- **github:** fully-typed catalog of every GitHub webhook event, typed from `@octokit/webhooks-types`.
- **clerk, resend, shopify:** webhook plugins with signature verification.
- **cli:** `relay init` scaffolds `relay.ts` (wiring only) and `relay.handlers.ts` (a `registerHandlers(relay)` function), plus `relay dev`, `relay trigger`, `relay replay`, `relay inspect`, `relay events`, and `relay migrate`.
- **database:** multi-dialect storage (Postgres, SQLite, MySQL) auto-detected from the client you pass, replacing the earlier Postgres-only `@relayos/postgres` package.

### BREAKING CHANGES

- Provider plugins moved from subpath imports to their own packages: `relayos/plugins/stripe` → `@relayos/stripe`, `relayos/plugins/github` → `@relayos/github`. The Next.js adapter stays at `relayos/next-js` — it was briefly split into `@relayos/nextjs` and has been folded back in.
