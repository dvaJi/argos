import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consoleMethods = ["log", "error", "warn", "info", "debug", "trace"] as const;
const savedConsole = Object.fromEntries(consoleMethods.map((method) => [method, console[method]])) as Pick<
  Console,
  (typeof consoleMethods)[number]
>;

beforeEach(() => {
  vi.resetModules();
  Object.assign(console, savedConsole);
});

afterEach(() => {
  Object.assign(console, savedConsole);
});

describe("logger", () => {
  it("uses the pre-hook console when electron-log is unavailable", async () => {
    const error = vi.fn();
    console.error = error;

    const { default: logger } = await import("@argos/shared/logger");

    logger.error("fallback error");

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("fallback error");
  });
});
