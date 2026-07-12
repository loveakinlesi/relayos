# @relayos/cli

The RelayOS CLI (`relay`): scaffolding, migrations, and local dev tooling for the RelayOS runtime.

```sh
pnpm add -D @relayos/cli
```

| Command                                                     | What it does                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `relay init [--force]`                                      | Scaffold `relayos.config.ts` in the current directory      |
| `relay migrate`                                             | Apply RelayOS's Postgres migrations (reads `DATABASE_URL`) |
| `relay dev [--dir <path>]`                                  | Run your app's dev server and tail new executions live     |
| `relay trigger <provider> <eventType> [--data '<json>']`    | Simulate a real, signed provider webhook delivery          |
| `relay inspect <eventId\|executionId> [--json] [--history]` | Show an execution's status, steps, and logs                |
| `relay replay <eventId\|executionId> [--print]`             | Replay a historical execution as a new one                 |
| `relay events list [--json] [--limit <n>]`                  | List recent executions, newest first                       |

```sh
DATABASE_URL=postgres://localhost:5432/myapp pnpm exec relay dev
pnpm exec relay trigger stripe charge.succeeded --data '{"id":"ch_1","amount":1000,"currency":"usd"}'
```

See the [RelayOS documentation](https://github.com/loveakinlesi/relayos#readme) for the full command reference.
