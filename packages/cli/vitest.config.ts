import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "relayos/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.spec.ts"],
    exclude: ["src/__tests__/**/*.integration.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/index.ts",
        "src/commands/*.ts",
        "src/utils/*.ts",
      ],
      exclude: [
        "src/__tests__/**/*.spec.ts",
        "src/__tests__/**/*.integration.spec.ts",
      ],
    },
  },
});
