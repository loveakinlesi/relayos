import { describe, expect, it, vi } from "vitest";

import { StepStatus } from "../types/event.js";
import { findStepByName, findStepsByExecution, upsertStep } from "./steps.repo.js";

describe("steps.repo", () => {
  it("upserts a step with defaults and serialized output", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "step_1", step_name: "deliver-email", status: StepStatus.Pending }],
    });

    const result = await upsertStep(
      { query } as never,
      "relayos",
      "exe_1",
      "deliver-email",
      { output: { ok: true } },
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO relayos.steps"),
      [
        "exe_1",
        "deliver-email",
        StepStatus.Pending,
        JSON.stringify({ ok: true }),
        null,
        null,
        null,
      ],
    );
    expect(result).toEqual({
      id: "step_1",
      step_name: "deliver-email",
      status: StepStatus.Pending,
    });
  });

  it("throws when an upsert returns no row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      upsertStep({ query } as never, "relayos", "exe_1", "missing", {}),
    ).rejects.toThrow('Failed to upsert step "missing"');
  });

  it("finds a step by name and returns null when absent", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "step_1", step_name: "charge-card" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      findStepByName({ query } as never, "relayos", "exe_1", "charge-card"),
    ).resolves.toEqual({ id: "step_1", step_name: "charge-card" });
    await expect(
      findStepByName({ query } as never, "relayos", "exe_1", "notify-user"),
    ).resolves.toBeNull();
  });

  it("lists execution steps in creation order", async () => {
    const rows = [
      { id: "step_1", step_name: "a" },
      { id: "step_2", step_name: "b" },
    ];
    const query = vi.fn().mockResolvedValue({ rows });

    await expect(findStepsByExecution({ query } as never, "relayos", "exe_1")).resolves.toBe(rows);
  });
});
