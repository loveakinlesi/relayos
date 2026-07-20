# @restaq/cli

The Restaq CLI (`relay`): scaffolding, migrations, and local dev tooling for the Restaq runtime.

`restaq` bundles this package's `relay` bin automatically - most projects never need to install `@restaq/cli` directly. Nothing installed at all? `npx restaq@latest init` scaffolds a project from scratch. Want the CLI as its own dependency (e.g. a CI image that only runs `relay migrate`)?

```sh
pnpm add -D @restaq/cli
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

See the [Restaq documentation](https://github.com/loveakinlesi/restaq#readme) for the full command reference.
