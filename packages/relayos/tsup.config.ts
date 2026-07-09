import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/next-js.ts', 'src/plugins/stripe.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
