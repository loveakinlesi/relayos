# RelayOS CLI

Command-line interface for RelayOS. Provides tooling for:

- Database setup and migrations
- Local development and webhook debugging
- Deterministic event replay
- Runtime inspection and health checks

## Installation

```bash
npm install relayos
```

or run directly:

```bash
npx relayos <command>
```

## Commands

- `init` - Initialize RelayOS configuration
- `migrate` - Run database migrations
- `events list` - List webhook events
- `events inspect` - Inspect event details
- `replay` - Replay events through runtime
- `deadletters` - Manage dead letter queue
- `status` - Check runtime health

See `relayos --help` for detailed options.
