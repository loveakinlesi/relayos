import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  noExternal: ["relayos/core"],
  esbuildOptions(options) {
    options.alias = {
      ...(options.alias ?? {}),
      "relayos/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    };
  },
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
});
