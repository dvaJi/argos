import { afterEach, describe, expect, it, vi } from "vitest";

const getSidecarHandleMock = vi.hoisted(() => vi.fn());

vi.mock("#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook", () => ({
  getSidecarHandle: getSidecarHandleMock,
}));

import { invokeDaemonRoute } from "../../../src/main/routes/daemonRouteProxy";

describe("invokeDaemonRoute", () => {
  afterEach(() => {
    getSidecarHandleMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("throws when the daemon sidecar is unavailable", async () => {
    // The proxy grants the sidecar hook a registration window before giving
    // up, so simulate that window elapsing instead of really waiting it out.
    vi.useFakeTimers();
    getSidecarHandleMock.mockReturnValue(null);

    const expectation = expect(
      invokeDaemonRoute("chat.sendMessage", { sessionId: "session-1", content: "hi" }),
    ).rejects.toMatchObject({
      name: "DaemonRouteError",
      code: "daemon_not_running",
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await expectation;
    vi.useRealTimers();
  });

  it("throws daemon_not_running when the daemon never becomes ready", async () => {
    getSidecarHandleMock.mockReturnValue({
      port: 4321,
      isRunning: () => false,
      whenHealthy: vi.fn().mockRejectedValue(new Error("Daemon did not become healthy within 1000ms")),
    });

    await expect(
      invokeDaemonRoute("chat.sendMessage", { sessionId: "session-1", content: "hi" }),
    ).rejects.toMatchObject({
      name: "DaemonRouteError",
      code: "daemon_not_running",
      message: "Daemon is not ready: Daemon did not become healthy within 1000ms",
    });
  });

  it("posts the route payload to the daemon route endpoint", async () => {
    getSidecarHandleMock.mockReturnValue({
      port: 4321,
      isRunning: () => true,
      whenHealthy: vi.fn().mockResolvedValue(undefined),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        output: { accepted: true, requestId: null, messageId: null },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(invokeDaemonRoute("chat.sendMessage", { sessionId: "session-1", content: "hi" })).resolves.toEqual({
      accepted: true,
      requestId: null,
      messageId: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4321/api/v1/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: "chat.sendMessage",
        input: { sessionId: "session-1", content: "hi" },
      }),
    });
  });

  it("marks missing daemon routes as native-required", async () => {
    getSidecarHandleMock.mockReturnValue({
      port: 4321,
      isRunning: () => true,
      whenHealthy: vi.fn().mockResolvedValue(undefined),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "unknown_route", message: "Unknown route" },
        }),
      }),
    );

    await expect(invokeDaemonRoute("settings.openNativeDialog", {})).rejects.toMatchObject({
      name: "DaemonRouteError",
      code: "native_required",
      route: "settings.openNativeDialog",
      status: 404,
      daemonCode: "unknown_route",
    });
  });

  it("includes the HTTP status when a daemon route fails without an error payload", async () => {
    getSidecarHandleMock.mockReturnValue({
      port: 4321,
      isRunning: () => true,
      whenHealthy: vi.fn().mockResolvedValue(undefined),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          ok: false,
        }),
      }),
    );

    await expect(
      invokeDaemonRoute("chat.sendMessage", { sessionId: "session-1", content: "hi" }),
    ).rejects.toMatchObject({
      name: "DaemonRouteError",
      code: "daemon_route_failed",
      route: "chat.sendMessage",
      status: 500,
      message: "Daemon route chat.sendMessage failed (HTTP 500)",
    });
  });
});
