// Forwards to @relayos/cli's own CLI entry point - relayos is already a
// required dependency of every project, so this gives every project the
// `relay` command for free (npx relayos@latest init works with nothing
// pre-installed) without needing a separate @relayos/cli install.
import '@relayos/cli';
