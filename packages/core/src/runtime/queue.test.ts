import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcurrencyQueue } from "./queue.js";

describe("ConcurrencyQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs tasks up to maxConcurrent immediately", () => {
    const queue = new ConcurrencyQueue(2);
    const started: number[] = [];

    const task = (id: number) => async () => {
      started.push(id);
      await new Promise<void>((r) => setTimeout(r, 10));
    };

    queue.enqueue(task(1));
    queue.enqueue(task(2));
    queue.enqueue(task(3));

    expect(queue.active).toBe(2);
    expect(queue.pending).toBe(1);
    expect(started).toEqual([1, 2]);
  });

  it("drains the queue as tasks complete", async () => {
    vi.useFakeTimers();
    const queue = new ConcurrencyQueue(1);
    const order: number[] = [];

    const makeTask = (id: number, ms: number) => async () => {
      await new Promise<void>((r) => setTimeout(r, ms));
      order.push(id);
    };

    queue.enqueue(makeTask(1, 10));
    queue.enqueue(makeTask(2, 5));
    queue.enqueue(makeTask(3, 5));

    await vi.advanceTimersByTimeAsync(60);

    expect(order).toEqual([1, 2, 3]);
    expect(queue.active).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it("releases slot on task failure and continues draining", async () => {
    vi.useFakeTimers();
    const queue = new ConcurrencyQueue(1);
    const completed: number[] = [];

    queue.enqueue(async () => {
      throw new Error("task 1 failed");
    });
    queue.enqueue(async () => {
      completed.push(2);
    });

    await vi.runAllTimersAsync();

    expect(completed).toEqual([2]);
    expect(queue.active).toBe(0);
  });

  it("tracks active and pending counts correctly", () => {
    const queue = new ConcurrencyQueue(2);
    let resolve1!: () => void;
    let resolve2!: () => void;

    queue.enqueue(() => new Promise<void>((r) => { resolve1 = r; }));
    queue.enqueue(() => new Promise<void>((r) => { resolve2 = r; }));
    queue.enqueue(async () => {});

    expect(queue.active).toBe(2);
    expect(queue.pending).toBe(1);

    resolve1();
    resolve2();
  });
});
