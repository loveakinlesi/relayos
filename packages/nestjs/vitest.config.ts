import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "relayos/core/replay/replay",
        replacement: fileURLToPath(
        new URL("../core/src/replay/replay.ts", import.meta.url),
        ),
      },
      {
        find: "relayos/core/replay/resume",
        replacement: fileURLToPath(
        new URL("../core/src/replay/resume.ts", import.meta.url),
        ),
      },
      {
        find: "relayos/core/runtime/internals",
        replacement: fileURLToPath(
        new URL("../core/src/runtime/internals.ts", import.meta.url),
        ),
      },
      {
        find: "relayos/core/persistence/executions.repo",
        replacement: fileURLToPath(
        new URL("../core/src/persistence/executions.repo.ts", import.meta.url),
        ),
      },
      {
        find: "relayos/core/persistence/steps.repo",
        replacement: fileURLToPath(
        new URL("../core/src/persistence/steps.repo.ts", import.meta.url),
        ),
      },
      {
        find: "relayos/core",
        replacement: fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
