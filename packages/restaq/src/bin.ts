// Forwards to @restaq/cli's own CLI entry point - restaq is already a
// required dependency of every project, so this gives every project the
// `relay` command for free (npx restaq@latest init works with nothing
// pre-installed) without needing a separate @restaq/cli install.
import '@restaq/cli';
