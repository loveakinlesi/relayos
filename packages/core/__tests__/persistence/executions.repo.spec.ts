import { describe, expect, it, vi } from "vitest";

import { ExecutionStatus } from "../../src/types/event.js";
import {
  createExecution,
  findExecutionById,
  findExecutionsByEventId,
  findExecutionsByStatus,
  updateExecutionStatus,
} from "../../src/persistence/executions.repo.js";

describe("executions.repo", () => {
  it("creates a pending execution", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "exe_1", status: ExecutionStatus.Pending, attempt: 2 }],
    });

    await expect(createExecution({ query } as never, "relayos", "evt_1", 2)).resolves.toEqual({
      id: "exe_1",
      status: ExecutionStatus.Pending,
      attempt: 2,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO relayos.executions"), [
      "evt_1",
      ExecutionStatus.Pending,
      2,
    ]);
  });

  it("throws when execution creation returns no row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(createExecution({ query } as never, "relayos", "evt_1")).rejects.toThrow(
      "Failed to create execution",
    );
  });

  it("prevents invalid execution state transitions", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "exe_1",
              status: ExecutionStatus.Pending,
            },
          ],
        }),
    } as never;

    await expect(
      updateExecutionStatus(pool, "relayos", "exe_1", ExecutionStatus.Completed),
    ).rejects.toThrow('Invalid execution status transition from "pending" to "completed"');
  });

  it("updates execution status when the transition is valid", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "exe_1", status: ExecutionStatus.Pending }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "exe_1", status: ExecutionStatus.Running }],
        }),
    } as never;

    await expect(
      updateExecutionStatus(pool, "relayos", "exe_1", ExecutionStatus.Running, {
        startedAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ id: "exe_1", status: ExecutionStatus.Running });
  });

  it("throws when the execution is missing before or after update", async () => {
    await expect(
      updateExecutionStatus(
        { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
        "relayos",
        "missing",
        ExecutionStatus.Running,
      ),
    ).rejects.toThrow('Execution "missing" not found before status update');

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "exe_1", status: ExecutionStatus.Pending }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as never;

    await expect(
      updateExecutionStatus(pool, "relayos", "exe_1", ExecutionStatus.Running),
    ).rejects.toThrow('Execution "exe_1" not found after status update');
  });

  it("finds executions by id, event id, and status", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "exe_1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "exe_1" }, { id: "exe_2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "exe_3" }] });

    await expect(findExecutionById({ query } as never, "relayos", "exe_1")).resolves.toEqual({
      id: "exe_1",
    });
    await expect(findExecutionsByEventId({ query } as never, "relayos", "evt_1")).resolves.toEqual([
      { id: "exe_1" },
      { id: "exe_2" },
    ]);
    await expect(
      findExecutionsByStatus(
        { query } as never,
        "relayos",
        [ExecutionStatus.Pending, ExecutionStatus.Retrying],
      ),
    ).resolves.toEqual([{ id: "exe_3" }]);
  });
});
