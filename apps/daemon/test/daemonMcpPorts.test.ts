import { describe, expect, it, vi } from "bun:test";
import { createDaemonMcpPorts } from "../src/host/daemonMcpPorts";

describe("createDaemonMcpPorts", () => {
  it("exposes custom models from the daemon config presenter", () => {
    const configPresenter = {
      getMcpServers: vi.fn(() => ({})),
      getProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => [{ id: "provider-model", name: "Provider" }]),
      getCustomModels: vi.fn(() => [{ id: "custom-model", name: "Custom" }]),
    };
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      db: { prepare: vi.fn() } as any,
      sessionRepository: {
        get: vi.fn(),
        listMessages: vi.fn(),
      } as any,
    });

    expect(ports.services.getProviderModels?.("openai")).toEqual([{ id: "provider-model", name: "Provider" }]);
    expect(ports.services.getCustomModels?.("openai")).toEqual([{ id: "custom-model", name: "Custom" }]);
  });

  it("creates shared in-memory servers for daemon-safe built-ins", () => {
    const configPresenter = {
      getMcpServers: vi.fn(() => ({})),
      getProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => []),
      getCustomModels: vi.fn(() => []),
      getLanguage: vi.fn(() => "en-US"),
      getCustomPrompts: vi.fn(() => []),
    };
    const db = {
      prepare: vi.fn((sql: string) => ({
        all: vi.fn(() => {
          if (sql.includes("FROM daemon_sessions")) {
            return [];
          }
          return [];
        }),
        get: vi.fn(() => ({ count: 0, total: 0 })),
      })),
    };
    const sessionRepository = {
      get: vi.fn(async () => null),
      listMessages: vi.fn(async () => []),
    };
    const ports = createDaemonMcpPorts({
      appVersion: "1.0.0",
      eventPublisher: { publish: vi.fn() } as any,
      configPresenter: configPresenter as any,
      configDir: "/tmp/argos",
      db: db as any,
      sessionRepository: sessionRepository as any,
    });

    expect(ports.services.getInMemoryServer?.("Artifacts", [], {})).toEqual(
      expect.objectContaining({ startServer: expect.any(Function) }),
    );
    expect(ports.services.getInMemoryServer?.("argos-inmemory/conversation-search-server", [], {})).toEqual(
      expect.objectContaining({ startServer: expect.any(Function) }),
    );
  });
});
