import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/lib.ts'],
  format: ['esm'],
  // tsup applies `banner` to every entry, so lib.js also gets a leading
  // shebang line - harmless (Node's module loader strips a leading `#!`
  // line from any file it loads, executable or not), just cosmetically
  // odd for a library entry. Not worth a build-config workaround.
  banner: { js: '#!/usr/bin/env node' },
  dts: true,
  sourcemap: true,
  clean: true,
});
