import { afterEach, describe, expect, it, vi } from "vitest";

const getSidecarHandleMock = vi.hoisted(() => vi.fn());

vi.mock("@/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook", () => ({
  getSidecarHandle: getSidecarHandleMock,
}));

import { invokeDaemonRoute } from "../../../../src/main/routes/daemonRouteProxy";

describe("invokeDaemonRoute", () => {
  afterEach(() => {
    getSidecarHandleMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("throws when the daemon sidecar is unavailable", async () => {
    getSidecarHandleMock.mockReturnValue(null);

    await expect(invokeDaemonRoute("chat.sendMessage", { sessionId: "session-1", content: "hi" })).rejects.toThrow(
      "Daemon is not running",
    );
  });

  it("posts the route payload to the daemon route endpoint", async () => {
    getSidecarHandleMock.mockReturnValue({
      port: 4321,
      isRunning: () => true,
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
});
