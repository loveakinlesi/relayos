import { describe, expect, it } from "vitest";
import { RelayConfigSchema } from "../../src/types/config.js";

describe("RelayConfigSchema", () => {
  it("applies defaults for optional sections", () => {
    const parsed = RelayConfigSchema.parse({
      database: { connectionString: "postgres://localhost:5432/db" },
    });

    expect(parsed.database.schema).toBe("relayos");
    expect(parsed.retry.maxAttempts).toBe(3);
    expect(parsed.concurrency.maxConcurrent).toBe(10);
    expect(parsed.retryPollIntervalMs).toBe(5000);
  });

  it("rejects invalid schema names", () => {
    expect(() =>
      RelayConfigSchema.parse({
        database: {
          connectionString: "postgres://localhost:5432/db",
          schema: "bad-schema-name",
        },
      }),
    ).toThrow();
  });

  it("rejects empty connection string", () => {
    expect(() =>
      RelayConfigSchema.parse({
        database: { connectionString: "" },
      }),
    ).toThrow();
  });
});
