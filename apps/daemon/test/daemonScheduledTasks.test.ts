import { describe, expect, it, vi } from "vitest";
import { DaemonScheduledTasks } from "../src/host/daemonScheduledTasks";

describe("DaemonScheduledTasks", () => {
  const createHarness = (tasks: Array<Record<string, unknown>> = []) => {
    let settings = { version: 1 as const, tasks };
    const eventPublisher = { publish: vi.fn() };
    const sessionRepository = {
      create: vi.fn(async () => ({ id: "session-1" })),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn(async () => ({ sessionId: "session-1" })),
    };
    const runtime = new DaemonScheduledTasks({
      configPresenter: {
        getScheduledTasksConfig: () => settings,
        setScheduledTasksConfig: (next) => {
          settings = next;
          return settings;
        },
        getNotificationsEnabled: () => true,
      } as never,
      eventPublisher: eventPublisher as never,
      sessionRepository: sessionRepository as never,
      providerExecutionPort: providerExecutionPort as never,
    });

    return { runtime, eventPublisher, sessionRepository, providerExecutionPort, getSettings: () => settings };
  };

  it("auto-sends prompt tasks through the daemon session pipeline", async () => {
    const task = {
      id: "task-1",
      name: "Daily prompt",
      enabled: true,
      trigger: { kind: "daily", hour: 9, minute: 0 },
      action: {
        kind: "prompt",
        title: "Daily",
        message: "Draft the plan",
        autoSend: true,
        agentId: "argos",
        providerId: "provider-1",
        modelId: "model-1",
        systemPrompt: "Be terse",
      },
      createdAt: 1,
      lastFiredAt: null,
    } as const;
    const harness = createHarness([task as never]);

    const result = await harness.runtime.fireNow("task-1");

    expect(harness.sessionRepository.create).toHaveBeenCalledWith(
      {
        agentId: "argos",
        message: "Draft the plan",
        providerId: "provider-1",
        modelId: "model-1",
        generationSettings: { systemPrompt: "Be terse" },
      },
      -1,
    );
    expect(harness.providerExecutionPort.sendMessage).toHaveBeenCalledWith("session-1", "Draft the plan");
    expect(harness.eventPublisher.publish).toHaveBeenCalledWith("scheduledTasks.notification", {
      id: "scheduled:task-1",
      title: "Daily",
      body: "Draft the plan",
    });
    expect(result.task.lastFiredAt).toEqual(expect.any(Number));
  });

  it("publishes daemon notifications for notification tasks", async () => {
    const task = {
      id: "task-2",
      name: "Notify",
      enabled: true,
      trigger: { kind: "once", firesAt: Date.now() + 1_000 },
      action: { kind: "notify", title: "Reminder", body: "Take a break" },
      createdAt: 1,
      lastFiredAt: null,
    } as const;
    const harness = createHarness([task as never]);

    await harness.runtime.fireNow("task-2");

    expect(harness.eventPublisher.publish).toHaveBeenCalledWith("scheduledTasks.notification", {
      id: "scheduled:task-2",
      title: "Reminder",
      body: "Take a break",
    });
  });

  it("falls back to notification-only for draft prompt tasks (headless daemon has no window)", async () => {
    const task = {
      id: "task-3",
      name: "Draft",
      enabled: true,
      trigger: { kind: "daily", hour: 9, minute: 0 },
      action: {
        kind: "prompt",
        title: "Draft",
        message: "Open the draft",
        autoSend: false,
      },
      createdAt: 1,
      lastFiredAt: null,
    } as const;
    const harness = createHarness([task as never]);

    // The headless daemon has no desktop window, so draft (non-auto-send) prompt
    // tasks can't open a draft UI. They must not crash — they fall through to a
    // notification so the user still sees the task fired.
    const result = await harness.runtime.fireNow("task-3");

    expect(harness.sessionRepository.create).not.toHaveBeenCalled();
    expect(harness.providerExecutionPort.sendMessage).not.toHaveBeenCalled();
    expect(harness.eventPublisher.publish).toHaveBeenCalledWith("scheduledTasks.notification", {
      id: "scheduled:task-3",
      title: "Draft",
      body: "Open the draft",
    });
    expect(result.task.lastFiredAt).toEqual(expect.any(Number));
  });
});
