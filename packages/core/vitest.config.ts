import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.spec.ts"],
    exclude: ["__tests__/**/*.integration.spec.ts"],
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
        "__tests__/**/*.spec.ts",
        "__tests__/**/*.integration.spec.ts",
        "src/persistence/postgres/sql/**",
      ],
    },
  },
});
