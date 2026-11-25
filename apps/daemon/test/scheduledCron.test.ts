import { describe, expect, it, vi } from "bun:test";
import { computeNextFireAt, normalizeScheduledTasksConfig } from "@argos/backend-core/scheduled/normalize";
import type { ScheduledTask } from "@argos/shared/scheduledTasks";

function cronTask(expression: string, timezone = "UTC"): ScheduledTask {
  return {
    id: "cron-1",
    name: "Cron",
    enabled: true,
    trigger: { kind: "cron", expression, timezone, misfire: "run-once" },
    action: { kind: "prompt", title: "Prompt", message: "Go", autoSend: true, target: { kind: "new-session" } },
    createdAt: 0,
    lastFiredAt: null,
  };
}

describe("cron schedules", () => {
  it("computes the next UTC occurrence", () => {
    const next = computeNextFireAt(cronTask("*/5 * * * *"), Date.parse("2026-01-01T00:00:00Z"));
    expect(next).toBe(Date.parse("2026-01-01T00:05:00Z"));
  });

  it("honours an IANA timezone", () => {
    const next = computeNextFireAt(cronTask("0 9 * * *", "America/New_York"), Date.parse("2026-01-01T00:00:00Z"));
    expect(next).toBe(Date.parse("2026-01-01T14:00:00Z"));
  });

  it("returns null for an invalid expression without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(computeNextFireAt(cronTask("not a cron"), Date.now())).toBeNull();
    warn.mockRestore();
  });

  it("normalizes old configs to version 2 and keeps cron targets", () => {
    const normalized = normalizeScheduledTasksConfig({
      version: 1,
      tasks: [
        {
          id: "task-1",
          name: "Morning",
          enabled: true,
          trigger: { kind: "cron", expression: "0 9 * * *", timezone: "local", misfire: "run-once" },
          action: {
            kind: "prompt",
            title: "Morning",
            message: "Start",
            autoSend: true,
            target: { kind: "session", sessionId: "session-1" },
          },
          createdAt: 1,
          lastFiredAt: null,
        },
      ],
    });
    expect(normalized.version).toBe(2);
    expect(normalized.tasks[0]?.trigger).toEqual({
      kind: "cron",
      expression: "0 9 * * *",
      timezone: "local",
      misfire: "run-once",
    });
    expect(normalized.tasks[0]?.action).toMatchObject({ target: { kind: "session", sessionId: "session-1" } });
  });
});
