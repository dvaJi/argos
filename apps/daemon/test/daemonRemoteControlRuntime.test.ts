import { describe, expect, it } from "bun:test";
import { DaemonRemoteControlRuntime } from "../src/host/daemonRemoteControlRuntime";

/**
 * In-memory fake of the daemon config presenter — just the getSetting/setSetting
 * surface the RemoteBindingStore uses, plus listAgents/getDefaultProjectPath.
 */
function makeFakeConfig(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    getSetting: <T>(key: string) => (store[key] as T | undefined) ?? null,
    setSetting: (key: string, value: unknown) => {
      store[key] = value;
    },
    getDefaultProjectPath: () => null,
    getDefaultModel: () => ({ providerId: "openai", modelId: "test-model" }),
    getProviders: () => [{ id: "openai", name: "OpenAI", enable: true, models: [{ id: "test-model" }] }],
    getModelStatusMap: () => ({}),
    listAgents: async () => [{ id: "argos", name: "Argos", type: "argos" }],
    resolveArgosAgentConfig: async () => ({
      defaultModelPreset: { providerId: "openai", modelId: "test-model" },
    }),
    _store: store,
  };
}

function makeHost(config = makeFakeConfig()) {
  return new DaemonRemoteControlRuntime({
    configPresenter: config as any,
    dataDir: "/tmp/rc-test",
    sessionRepository: {} as any,
    providerExecutionPort: {
      sendMessage: async () => undefined,
      getActiveGeneration: () => null,
      cancelGeneration: async () => undefined,
      respondToolInteraction: async () => ({}),
    },
  });
}

describe("DaemonRemoteControlRuntime", () => {
  it("constructs the daemon-owned runtime and lists all channels", async () => {
    const config = makeFakeConfig();
    const host = makeHost(config);
    await host.initialize();

    const channels = await host.runtime.listRemoteChannels();
    expect(channels.length).toBe(4);
    expect(channels.map((c: any) => c.id).sort()).toEqual(["discord", "qqbot", "telegram", "weixin-ilink"]);
  });

  it("round-trips Telegram settings through the config blob", async () => {
    const config = makeFakeConfig();
    const host = makeHost(config);

    const saved = (await host.runtime.saveChannelSettings("telegram", {
      botToken: "123:ABC",
      remoteEnabled: false,
      defaultAgentId: "argos",
      defaultWorkdir: "",
    })) as any;
    expect(saved.botToken).toBe("123:ABC");
    expect(saved.remoteEnabled).toBe(false);

    const fetched = (await host.runtime.getChannelSettings("telegram")) as any;
    expect(fetched.botToken).toBe("123:ABC");

    // The settings persisted into the config blob under the remoteControl key.
    expect(config._store.remoteControl).toBeDefined();
  });

  it("createChannelPairCode issues a code and clearChannelPairCode clears it", async () => {
    const config = makeFakeConfig();
    const host = makeHost(config);

    const { code } = await host.runtime.createChannelPairCode("telegram");
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);

    const snapshot = (await host.runtime.getChannelPairingSnapshot("telegram")) as any;
    expect(snapshot.pairCode).toBe(code);

    await host.runtime.clearChannelPairCode("telegram");
    const after = (await host.runtime.getChannelPairingSnapshot("telegram")) as any;
    expect(after.pairCode).toBeNull();
  });

  it("reports disabled when a channel is not enabled", async () => {
    const config = makeFakeConfig();
    const host = makeHost(config);
    await host.initialize();

    const status = (await host.runtime.getChannelStatus("telegram")) as any;
    expect(status.state).toBe("disabled");
  });

  it("destroy completes without error", async () => {
    const config = makeFakeConfig();
    const host = makeHost(config);
    await host.initialize();
    await expect(host.destroy()).resolves.toBeUndefined();
  });
});
