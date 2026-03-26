import type { Pool } from "pg";
import { z } from "zod";

export const LogLevelSchema = z.enum(["info", "warn", "error"]);

export type LogLevel = z.infer<typeof LogLevelSchema>;

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  backoffBaseMs: z.number().int().positive().default(1000),
  backoffMultiplier: z.number().positive().default(2),
  backoffMaxMs: z.number().int().positive().default(60_000),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const ConcurrencyConfigSchema = z.object({
  maxConcurrent: z.number().int().positive().default(10),
});

export type ConcurrencyConfig = z.infer<typeof ConcurrencyConfigSchema>;

export const RelayConfigSchema = z.object({
  database: z.object({
    pool: z.custom<Pool>((value) => value !== undefined).optional(),
    connectionString: z.string().min(1).optional(),
    /**
     * Postgres schema name for all RelayOS tables.
     * Validated against [a-zA-Z_][a-zA-Z0-9_]* to prevent SQL injection.
     */
    schema: z
      .string()
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        "database.schema must match [a-zA-Z_][a-zA-Z0-9_]*",
      )
      .optional()
      .default("relayos"),
  }),
  retry: z.preprocess((value) => value ?? {}, RetryPolicySchema),
  concurrency: z.preprocess((value) => value ?? {}, ConcurrencyConfigSchema),
  logLevel: LogLevelSchema.optional().default("info"),
  /** Interval in ms that the retry poller checks for due retries. Default 5000. */
  retryPollIntervalMs: z.number().int().positive().default(5000),
}).superRefine((config, ctx) => {
  if (!config.database.connectionString && !config.database.pool) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "database.connectionString or database.pool is required",
      path: ["database"],
    });
  }
});

export type RelayConfig = z.infer<typeof RelayConfigSchema>;
