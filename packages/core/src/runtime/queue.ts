type Task = () => Promise<void>;

/**
 * In-memory FIFO concurrency queue.
 *
 * - Enforces a configurable maximum number of concurrent executions.
 * - Releases a concurrency slot when a task completes or fails.
 * - Tasks are drained automatically when capacity becomes available.
 */
export class ConcurrencyQueue {
  private readonly queue: Task[] = [];
  private running = 0;

  constructor(private readonly maxConcurrent: number) {}

  enqueue(task: Task): void {
    this.queue.push(task);
    this.drain();
  }

  private drain(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      // Task errors are handled inside runExecution() — the queue only manages slots.
      task()
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }
}
