import { defineConfig } from 'tsup';

// Separate config from tsup.config.ts on purpose: the main config builds
// the library entry points (index.ts, next-js.ts, etc.) that application
// code imports at runtime, and those must never carry a leading `#!`
// shebang line - some bundlers don't strip it the way Node's loader does.
// Only the bin script needs it, so it gets its own tsup invocation.
export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  clean: false,
});
