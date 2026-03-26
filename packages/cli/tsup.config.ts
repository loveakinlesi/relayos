import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["cjs"],
  outExtension() {
    return {
      js: ".cjs",
    };
  },
  shims: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  noExternal: ["relayos/core"],
  esbuildOptions(options) {
    options.alias = {
      ...(options.alias ?? {}),
      "relayos/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    };
  },
  external: [
    "chalk",
    "table",
    "prompts",
    "commander",
  ],
});
