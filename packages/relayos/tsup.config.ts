import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/next-js.ts', 'src/plugins/stripe.ts', 'src/plugins/github.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
