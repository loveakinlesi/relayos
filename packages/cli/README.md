# @relayos/cli

The RelayOS CLI (`relay`): scaffolding, migrations, and local dev tooling for the RelayOS runtime.

`relayos` bundles this package's `relay` bin automatically - most projects never need to install `@relayos/cli` directly. Nothing installed at all? `npx relayos@latest init` scaffolds a project from scratch. Want the CLI as its own dependency (e.g. a CI image that only runs `relay migrate`)?

```sh
pnpm add -D @relayos/cli
```

| Command                                                     | What it does                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `relay init [--force]`                                      | Scaffold `relay.ts` + `relay.handlers.ts`, install what you chose  |
| `relay migrate`                                             | Apply pending schema migrations (loads `relay.ts`)                |
| `relay dev [--dir <path>]`                                  | Run your app's dev server and tail new executions live            |
| `relay trigger <provider> <eventType> [--data '<json>']`    | Simulate a real, signed provider webhook delivery                 |
| `relay inspect <eventId\|executionId> [--json] [--history]` | Show an execution's status, steps, and logs                       |
| `relay replay <eventId\|executionId> [--print]`             | Replay a historical execution as a new one                        |
| `relay events list [--json] [--limit <n>]`                  | List recent executions, newest first                              |

```sh
pnpm exec relay dev
pnpm exec relay trigger stripe charge.succeeded --data '{"id":"ch_1","amount":1000,"currency":"usd"}'
```

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the full command reference.
