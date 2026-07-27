import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const files = new Map<string, string>();

  return { handlers, files };
});

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:/argos-test") },
  ipcMain: {
    removeHandler: vi.fn((channel: string) => state.handlers.delete(channel)),
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler)),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value, "utf8")),
    decryptString: vi.fn((value: Buffer) => value.toString("utf8")),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => state.files.has(path)),
  readFileSync: vi.fn((path: string) => state.files.get(path) ?? ""),
  writeFileSync: vi.fn((path: string, value: string) => state.files.set(path, value)),
  renameSync: vi.fn((source: string, destination: string) => {
    const value = state.files.get(source);
    if (value !== undefined) state.files.set(destination, value);
    state.files.delete(source);
  }),
  rmSync: vi.fn((path: string) => state.files.delete(path)),
}));

vi.mock("#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook", () => ({
  getSidecarHandle: vi.fn(() => null),
}));

describe("daemon remote machine credentials", () => {
  beforeEach(async () => {
    vi.resetModules();
    state.handlers.clear();
    state.files.clear();
    vi.stubGlobal("fetch", vi.fn());
    const { registerDaemonPortHandler } = await import("#/routes/daemonPortHandler");
    registerDaemonPortHandler();
  });

  it("stores, resolves, and deletes a paired machine credential without exposing it to the pairing result", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, sessionId: "session-1", sessionToken: "bearer-secret" }), {
        status: 200,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          output: {
            environmentId: "environment-1",
            serverVersion: "0.2.0",
            protocolVersion: 1,
            runtimeKind: "daemon",
            capabilities: ["chat", "sessions", "project-files"],
            compatible: true,
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const pair = state.handlers.get("pair-remote-machine");
    const resolve = state.handlers.get("get-remote-machine-credential");
    const remove = state.handlers.get("delete-remote-machine-credential");
    expect(pair).toBeDefined();
    expect(resolve).toBeDefined();
    expect(remove).toBeDefined();

    const send = vi.fn();
    const paired = await pair?.({ sender: { send } }, "https://build.example.test/?token=one-time-token", "request-1");
    expect(paired).toMatchObject({
      ok: true,
      remoteUrl: "https://build.example.test",
      sessionId: "session-1",
      environmentId: "environment-1",
      protocolVersion: 1,
      runtimeKind: "daemon",
      capabilities: ["chat", "sessions", "project-files"],
    });
    expect(paired).not.toHaveProperty("sessionToken");
    expect(paired).not.toHaveProperty("token");
    expect(send.mock.calls.map(([, payload]) => payload.stage)).toEqual([
      "parsing",
      "reaching",
      "exchanging",
      "authenticating",
      "storing",
    ]);
    const persistedCredentialFiles = [...state.files.values()].join("\n");
    expect(persistedCredentialFiles).not.toContain("bearer-secret");
    expect(persistedCredentialFiles).not.toContain("one-time-token");

    const resolved = await resolve?.({}, paired.credentialRef);
    expect(resolved).toEqual({
      token: "bearer-secret",
      remoteUrl: "https://build.example.test",
      sessionId: "session-1",
    });

    expect(await remove?.({}, paired.credentialRef)).toEqual({ localRemoved: true, remoteRevoked: true });
    expect(await resolve?.({}, paired.credentialRef)).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://build.example.test/api/v1/sessions/session-1",
      expect.objectContaining({ method: "DELETE", headers: { Authorization: "Bearer bearer-secret" } }),
    );
  });

  it("resolves the encrypted remote session again after a Desktop main-process restart", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, sessionId: "session-restart", sessionToken: "bearer-secret" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            output: {
              environmentId: "environment-1",
              serverVersion: "0.2.0",
              protocolVersion: 1,
              runtimeKind: "daemon",
              capabilities: ["chat", "sessions", "project-files"],
              compatible: true,
            },
          }),
          { status: 200 },
        ),
      );

    const pair = state.handlers.get("pair-remote-machine");
    const paired = await pair?.({}, "https://build.example.test/pair?token=one-time-token");

    vi.resetModules();
    state.handlers.clear();
    const { registerDaemonPortHandler } = await import("#/routes/daemonPortHandler");
    registerDaemonPortHandler();

    const resolve = state.handlers.get("get-remote-machine-credential");
    expect(resolve?.({}, paired.credentialRef)).toEqual({
      token: "bearer-secret",
      remoteUrl: "https://build.example.test",
      sessionId: "session-restart",
    });
  });

  it("returns stable error codes for rejected links and TLS failures", async () => {
    const pair = state.handlers.get("pair-remote-machine");
    expect(await pair?.({}, "https://user:pass@build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_invalid" },
    });
    expect(await pair?.({}, "http://127.0.0.1:3800/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "endpoint_loopback_remote" },
    });

    vi.mocked(fetch).mockRejectedValueOnce(new Error("TLS certificate verify failed"));
    expect(await pair?.({}, "https://build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "tls_untrusted" },
    });
  });

  it("only passes documented pairing failure codes through from the server", async () => {
    const pair = state.handlers.get("pair-remote-machine");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "pairing_expired", message: "Expired" } }), { status: 401 }),
    );
    expect(await pair?.({}, "https://build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_expired", message: "Expired" },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "unexpected_internal_code", message: "Unexpected" } }), {
        status: 500,
      }),
    );
    expect(await pair?.({}, "https://build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_failed", message: "Unexpected" },
    });
  });

  it("revokes a newly issued server session when authenticated verification fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, sessionId: "session-orphan", sessionToken: "bearer-secret" }), {
        status: 200,
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const pair = state.handlers.get("pair-remote-machine");
    const result = await pair?.({}, "https://build.example.test/pair?token=one-time-token");

    expect(result).toMatchObject({ ok: false, error: { code: "authenticated_rpc_failed" } });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://build.example.test/api/v1/sessions/session-orphan",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer bearer-secret" },
      }),
    );
  });

  it("forgets a credential locally without revoking its remote session when requested", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, sessionId: "session-local-only", sessionToken: "bearer-secret" }), {
        status: 200,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          output: { environmentId: "environment-1", serverVersion: "0.2.0", compatible: true },
        }),
        { status: 200 },
      ),
    );

    const pair = state.handlers.get("pair-remote-machine");
    const remove = state.handlers.get("delete-remote-machine-credential");
    const paired = await pair?.({}, "https://build.example.test/pair?token=one-time-token");

    expect(await remove?.({}, paired.credentialRef, false)).toEqual({
      localRemoved: true,
      remoteRevoked: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports remote revoke failure after still deleting the local credential", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, sessionId: "session-partial", sessionToken: "bearer-secret" }), {
        status: 200,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          output: { environmentId: "environment-1", serverVersion: "0.2.0", compatible: true },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const pair = state.handlers.get("pair-remote-machine");
    const remove = state.handlers.get("delete-remote-machine-credential");
    const resolve = state.handlers.get("get-remote-machine-credential");
    const paired = await pair?.({}, "https://build.example.test/pair?token=one-time-token");

    expect(await remove?.({}, paired.credentialRef, true)).toEqual({
      localRemoved: true,
      remoteRevoked: false,
    });
    expect(resolve?.({}, paired.credentialRef)).toBeNull();
  });
});
