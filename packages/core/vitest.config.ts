import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/index.ts",
        "src/context/create-context.ts",
        "src/context/step.ts",
        "src/errors/index.ts",
        "src/persistence/events.repo.ts",
        "src/persistence/executions.repo.ts",
        "src/persistence/steps.repo.ts",
        "src/plugins/registry.ts",
        "src/plugins/resolve-handler.ts",
        "src/replay/*.ts",
        "src/retry/*.ts",
        "src/runtime/*.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/persistence/postgres/sql/**",
      ],
    },
  },
});
