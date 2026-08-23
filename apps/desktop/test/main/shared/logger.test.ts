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

  it("createLogger prefixes messages with the scope", async () => {
    const log = vi.fn();
    console.log = log;

    const { createLogger } = await import("@argos/shared/logger");

    const logger = createLogger("Lifecycle");
    logger.info("startup complete", { durationMs: 12 });

    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[Lifecycle] startup complete", { durationMs: 12 });
  });

  it("createLogger prefixes non-string messages with a bare scope marker", async () => {
    const log = vi.fn();
    console.log = log;

    const { createLogger } = await import("@argos/shared/logger");

    const logger = createLogger("Config");
    logger.info({ event: "reload" });

    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[Config]", { event: "reload" });
  });
});
