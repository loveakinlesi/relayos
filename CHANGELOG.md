## [0.1.5](https://github.com/loveakinlesi/restaq/compare/v0.1.4...v0.1.5) (2026-07-21)


### Bug Fixes

* override brace-expansion to patched 5.0.7 (CVE-2026-13149) ([53d40da](https://github.com/loveakinlesi/restaq/commit/53d40da0ce3000f8e359e9be245e8c9b49121f96)), closes [hi#severity](https://github.com/hi/issues/severity)

## [0.1.4](https://github.com/loveakinlesi/restaq/compare/v0.1.3...v0.1.4) (2026-07-21)


### Bug Fixes

* **cli:** default relay init's App name prompt to package.json's name ([a6de045](https://github.com/loveakinlesi/restaq/commit/a6de045f88f5c3301571633b8b8b17d6e7884265))

## [0.1.3](https://github.com/loveakinlesi/restaq/compare/v0.1.2...v0.1.3) (2026-07-21)


### Bug Fixes

* **cli:** load .env from --dir before every command ([1fe1b9c](https://github.com/loveakinlesi/restaq/commit/1fe1b9cbdf044f576cb863030c09e25968779a53))

## [0.1.2](https://github.com/loveakinlesi/restaq/compare/v0.1.1...v0.1.2) (2026-07-20)


### Bug Fixes

* rename scaffolded relay.ts export from relay to restaq ([e8709c6](https://github.com/loveakinlesi/restaq/commit/e8709c6ac9729c52e197218a200fa3d49c6885df))

## [0.1.1](https://github.com/loveakinlesi/restaq/compare/v0.1.0...v0.1.1) (2026-07-17)


### Bug Fixes

* **deps:** patch 4 Dependabot alerts (esbuild, vite, postcss) ([8da7cca](https://github.com/loveakinlesi/restaq/commit/8da7ccaa56e3774ebb3eda533dbb46112c8202ec))
* **release:** send npm auth token as NODE_AUTH_TOKEN ([74df556](https://github.com/loveakinlesi/restaq/commit/74df556342b760d6aafb0a5f374233ad2a9e7a46))
* **release:** unblock the automated release pipeline ([b292426](https://github.com/loveakinlesi/restaq/commit/b29242620144e30cbe3032f3385fb9218653bf6a))
* **release:** use HUSKY=0 to skip the commit-msg hook, not hooksPath ([f4a6c0d](https://github.com/loveakinlesi/restaq/commit/f4a6c0de7890cae7b9f39c02145307dd6c24bbc3))


### Reverts

* undo phantom 0.1.1 release commit ([341a7e5](https://github.com/loveakinlesi/restaq/commit/341a7e52f44a80121f7c09be2dfc31e03e012a64))
* undo second phantom 0.1.1 release commit ([18adc70](https://github.com/loveakinlesi/restaq/commit/18adc70562a5ac8a4b9d5a7c72de5882923bcfcb))

# Changelog

All notable changes to Restaq are documented here. Entries below this point are generated automatically by [semantic-release](https://github.com/semantic-release/semantic-release) from commit history.

## 0.1.0 (2026-07-16)

First public pre-release. Every package in the `@restaq/*` scope, plus `restaq` itself, ships as `0.1.0` and moves in lockstep from here on.

### Features

- **core:** durable executions, steps, retries, replay, and dedup, plus typed event-map inference — `createRelay` infers event types from the registered plugins.
- **restaq:** the SDK surface (`createRelay` + user-facing types) and the Next.js adapter (`restaq/next-js`), a thin layer over `@restaq/core`. In-memory storage by default — no database or provider plugin required to get started.
- **plugin:** plugin authoring kit (`definePlugin` and the HMAC signature helpers) for anyone writing a custom provider integration.
- **stripe:** fully-typed catalog of every Stripe event, typed from the `stripe` package (peer dependency).
- **github:** fully-typed catalog of every GitHub webhook event, typed from `@octokit/webhooks-types`.
- **clerk, resend, shopify:** webhook plugins with signature verification.
- **cli:** `relay init` scaffolds `relay.ts` (wiring only) and `relay.handlers.ts` (a `registerHandlers(relay)` function), plus `relay dev`, `relay trigger`, `relay replay`, `relay inspect`, `relay events`, and `relay migrate`.
- **database:** multi-dialect storage (Postgres, SQLite, MySQL) auto-detected from the client you pass, replacing the earlier Postgres-only `@restaq/postgres` package.

### BREAKING CHANGES

- Provider plugins moved from subpath imports to their own packages: `restaq/plugins/stripe` → `@restaq/stripe`, `restaq/plugins/github` → `@restaq/github`. The Next.js adapter stays at `restaq/next-js` — it was briefly split into `@restaq/nextjs` and has been folded back in.
