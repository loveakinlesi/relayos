# E2E Integration Tests — Design

## Goal

Add a root-level `e2e/` folder holding integration tests that exercise real, cross-package behavior — the CLI wizard's generated code driving a real running app, and the HTTP surface of that app — the kind of thing each package's own unit tests can't see, since they test in isolation.

## Why not just more unit tests

Every package in this monorepo already has strong unit-test coverage of its own internals (`@relayos/core`'s engine and storage layer, `@relayos/cli`'s template generation, package-manager detection, dialect detection, etc.). What's missing is a test that proves those pieces actually cooperate: a `relay.ts` built the way the wizard really builds it, loaded by the CLI's real `loadRelay()`, talking over real HTTP to a real running server backed by a real SQLite database. That's the gap `e2e/` fills.

## Scope

Two things, per explicit decision:
1. **Full CLI + app lifecycle** — scaffold a fixture app, start it as a real server process, drive it via the built CLI binary (`migrate`, `trigger`, `inspect`, `events list`).
2. **HTTP-level API tests** — same running app, but driven directly with `fetch` against its routes, no CLI process involved.

Out of scope for this round: testing `relay init`'s interactive terminal UI itself (arrow-key `select`/`multiselect` prompts). Driving that would need a pty/keystroke-simulation library (e.g. `node-pty`) purely for this, and the prompt UI already has an established manual-verification-only precedent from the CLI plan that shipped this session. Instead, the e2e suite calls the exact functions the wizard itself calls (`buildRelayConfigTemplate`, `detectPackageManager`, `installPackages`) to produce identical output, then verifies that output actually works end-to-end.

## Package shape

New workspace member `e2e/` (private, unpublished):

```
e2e/
  package.json          # private: true
  vitest.config.ts       # own config: no coverage thresholds, longer testTimeout
  tsconfig.json
  fixtures/
    create-fixture-app.ts   # writes a temp app dir per test
    server.mjs               # minimal node:http app used by every fixture
  cli-lifecycle.test.ts
  api.test.ts
  .tmp/                       # gitignored - fixture output lives here at test time
```

`pnpm-workspace.yaml` gains `e2e` alongside `packages/*` and `apps/*`.

Dependencies (all `workspace:*` except the last two):
- `relayos`
- `@relayos/core`
- `@relayos/cli`
- `@relayos/stripe`
- `better-sqlite3` (devDependency)
- `jiti` (devDependency — used by the fixture's own server, matching how the CLI already loads `relay.ts`)

No real `npm install` is performed anywhere in these tests. Because `e2e/` is itself a workspace package with the above dependencies declared, anything written into a subdirectory of `e2e/` resolves `relayos`/`@relayos/core`/etc. via Node's normal upward `node_modules` walk, landing on the real workspace-linked, already-built packages. This sidesteps the fact that none of these packages are published to npm (a literal fresh-project `npm install relayos` would 404) while still exercising the real built `dist/` output, not source.

## Sharing the wizard's real generated code

The point of the CLI-lifecycle test is to prove what the wizard *actually produces* works — not a hand-copied approximation that could quietly drift from the real thing. Today `@relayos/cli`'s `package.json` has no importable surface at all (`bin` only, no `exports`, no `.d.ts` output — confirmed by reading its `tsup.config.ts`, which only builds `src/index.ts`, and its `package.json`, which has no `main`/`exports`/`types` fields).

This design adds a second tsup entry, `src/lib.ts`, re-exporting exactly the functions the wizard itself calls:
- `buildRelayConfigTemplate`
- `databasePackages`
- `pluginPackages`
- `RELAY_HANDLERS_TEMPLATE`
- `detectPackageManager`
- `installPackages`

Exposed at the subpath `@relayos/cli/lib` (matching the existing `relayos/next-js` subpath convention already in the repo, rather than overloading `@relayos/cli`'s bare import to mean something other than "the CLI tool"). `tsup.config.ts` gains `dts: true` (currently off for this package) so the subpath has real types. `package.json` gains an `exports` map:

```json
"exports": {
  "./lib": {
    "types": "./dist/lib.d.ts",
    "default": "./dist/lib.js"
  }
},
"bin": {
  "relay": "./dist/index.js"
}
```

## The fixture: `create-fixture-app.ts`

A function `createFixtureApp(): Promise<{ dir: string; cleanup: () => Promise<void> }>` that, per test:

1. Creates a fresh directory under `e2e/.tmp/<random-uuid>/`.
2. Writes `relay.ts` using `buildRelayConfigTemplate({ database: 'sqlite', plugins: ['stripe'] })` from `@relayos/cli/lib` — **with one adjustment**: the generated `new Database('relay.db')` call is rewritten to use an absolute path anchored to the fixture directory itself (via `import.meta.url` inside the written file), not a bare relative string. This matters because the CLI process (via `--dir`) and the separately-spawned server process will each have their own, likely-different, `process.cwd()` — a relative `'relay.db'` would silently resolve to two different files on disk depending on which process's cwd it's evaluated against. Real end users running everything from one consistent project root don't hit this, so `buildRelayConfigTemplate`'s real output is untouched; only the fixture generator's copy gets the path substitution.
3. Writes `relay.handlers.ts` from the real `RELAY_HANDLERS_TEMPLATE`, with one `relay.on('test.ping', ...)` handler appended so there's an observable side effect to assert on.
4. Copies in the fixture's static `server.mjs` (see below), rewriting nothing — it's dialect-agnostic and fixture-agnostic, just loads whatever `relay.ts` sits next to it.
5. Returns the directory path and a `cleanup()` that removes it (`rm -rf`).

## `server.mjs` — the "running app"

A minimal `node:http` server, no framework:

```js
import { createServer } from 'node:http';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { relay } = await jiti.import('./relay.ts');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/relay\/([^/]+)$/);
  if (!match || req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }
  const response = await relay.handler(
    new Request(url, { method: 'POST', headers: req.headers, body: req, duplex: 'half' }),
    { params: { all: [match[1]] } },
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
});

server.listen(process.env.PORT ?? 0, () => {
  console.log(`listening:${server.address().port}`);
});
```

Deliberately narrow: only the one route the lifecycle test needs (`POST /api/relay/:provider`). Not a stand-in for `apps/web` — proving the Next.js integration itself is `apps/web`'s own concern, already covered by its existing build.

Spawned as a real child process (`node server.mjs`, `PORT=0` for an OS-assigned free port), with the test reading the `listening:<port>` line off stdout to know where to point the CLI's `--forward` and the `fetch` calls. This mirrors reality: the app and the CLI are two separate processes talking over HTTP, not one process calling into itself.

## Test suite 1: `cli-lifecycle.test.ts`

Per test: `createFixtureApp()` → spawn `server.mjs` → wait for its `listening:<port>` line → then, via `child_process.spawn` on the real built `packages/cli/dist/index.js`:

1. `migrate --dir <fixtureDir>` — assert exit code 0 and "Migrations applied." in stdout.
2. `trigger stripe charge.succeeded --data '{"id":"ch_e2e_1","amount":1000,"currency":"usd"}' --forward http://localhost:<port>` (with `STRIPE_WEBHOOK_SECRET` matching the fixture's plugin secret) — assert exit code 0 and a 200 response logged.
3. `inspect ch_e2e_1 --json --dir <fixtureDir>` — assert the JSON output shows `status: "completed"`.
4. `events list --json --dir <fixtureDir>` — assert the triggered execution appears.

Teardown: kill the server process, `cleanup()` the fixture directory.

## Test suite 2: `api.test.ts`

Per test: `createFixtureApp()` → spawn `server.mjs` → wait for its port → then use `fetch` directly:

1. `POST http://localhost:<port>/api/relay/stripe` with a real Stripe-signed test payload (signed the same way `@relayos/stripe`'s own tests sign one) — assert `200` and the JSON body shape (`{ execution: { status: 'completed', ... } }`).
2. A second `POST` with the same event ID — assert it's deduped (same execution `id` returned, not a new one).
3. An unsigned/garbage-signature `POST` — assert `401`.

No CLI process involved at all in this suite — it's testing the HTTP surface in isolation from the CLI.

## Vitest config

`e2e/vitest.config.ts` does **not** extend the repo's `vitest.config.base` (that base config sets up coverage thresholds meant for unit tests measuring source coverage — meaningless for a suite whose job is spawning child processes and making HTTP calls). Instead, a standalone config: `testTimeout: 30_000`, `hookTimeout: 30_000` (fixture setup/teardown spawns real processes), no coverage block.

Root `package.json`'s `"test"` script (`turbo test`) picks up `e2e/`'s own `test` script automatically once it's a workspace member with a `package.json` `scripts.test`. No `turbo.json` changes are needed for build ordering: its `test` task already declares `"dependsOn": ["^build", "build"]` (verified by reading `turbo.json`), so since `e2e/package.json` declares `@relayos/cli` as a `workspace:*` dependency, turbo's task graph automatically builds `@relayos/cli` (and everything it depends on) before running `e2e`'s tests - exactly what `cli-lifecycle.test.ts` needs, since it spawns `packages/cli/dist/index.js` directly.

## Error handling / flakiness considerations

- **Port collisions**: `PORT=0` lets the OS assign a free port per server instance — no fixed-port flakiness across parallel test files.
- **Process cleanup**: every test's `afterEach`/`afterAll` kills the spawned server (SIGTERM, matching the CLI's own `dev` command's shutdown handling) before removing the fixture directory, so a failed assertion never leaks a hanging server process.
- **SQLite file locking**: since the server and each CLI invocation are separate processes opening the same `relay.db` file, and CLI invocations are short-lived and sequential (never running concurrently with each other, only concurrently with the long-lived server), better-sqlite3's default locking handles this fine — no WAL-mode configuration needed for this scope.
- **Turbo caching**: e2e tests spawn real processes and touch the filesystem — mark the `e2e#test` task as unaffected by turbo's cache-and-skip default only if flaky (start without special-casing; revisit if reruns prove necessary).

## What this does not cover

- The wizard's actual terminal UI (arrow-key prompts) — manual verification only, as already established.
- Postgres/MySQL dialects in the e2e suite — the parametrized `store.contract.test.ts` in `@relayos/core` already covers all three dialects at the storage layer; the e2e suite's job is proving CLI+app+HTTP integration, not re-proving dialect correctness, so SQLite (fast, no external service) is sufficient here.
- `apps/web`'s Next.js-specific routes — those are `apps/web`'s own concern, exercised by its existing build/lint.
