import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/next-js.ts', 'src/express.ts', 'src/hono.ts', 'src/nestjs.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
