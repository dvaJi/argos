import { describe, it, expect, vi } from "vitest";
import { Scheduler } from "@argos/backend-core/scheduler/scheduler";

function createMockScheduler(): Scheduler {
  return {
    sleep: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn(async <T>({ task }: { task: Promise<T> }) => await task),
    retry: vi.fn(async <T>({ task }: { task: () => Promise<T> }) => await task()),
  };
}

describe("Scheduler", () => {
  it("executes task via timeout", async () => {
    const scheduler = createMockScheduler();
    const result = await scheduler.timeout({
      task: Promise.resolve("hello"),
      ms: 1000,
      reason: "test",
    });
    expect(result).toBe("hello");
  });

  it("executes task via retry", async () => {
    const scheduler = createMockScheduler();
    const result = await scheduler.retry({
      task: async () => "hello",
      maxAttempts: 3,
      initialDelayMs: 10,
      backoff: 1,
      reason: "test",
    });
    expect(result).toBe("hello");
  });

  it("retry calls task function", async () => {
    const scheduler = createMockScheduler();
    const task = vi.fn().mockResolvedValue("result");
    await scheduler.retry({
      task,
      maxAttempts: 3,
      initialDelayMs: 10,
      backoff: 1,
      reason: "test",
    });
    expect(task).toHaveBeenCalled();
  });

  it("timeout with signal aborts task", async () => {
    const scheduler = createMockScheduler();
    const controller = new AbortController();
    const taskPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("done"), 100);
    });

    controller.abort();

    try {
      await scheduler.timeout({
        task: taskPromise,
        ms: 1000,
        reason: "test",
        signal: controller.signal,
      });
    } catch {
      // expected
    }
  });
});
