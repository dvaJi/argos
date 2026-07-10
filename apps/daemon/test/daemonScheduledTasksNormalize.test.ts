import { describe, expect, it, vi } from "vitest";
import { normalizeScheduledTasksConfig } from "@argos/backend-core/scheduled/normalize";

describe("normalizeScheduledTasksConfig", () => {
  it("returns defaults quietly when scheduled tasks config is absent", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = normalizeScheduledTasksConfig(undefined);

    expect(result).toEqual({ version: 1, tasks: [] });
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
