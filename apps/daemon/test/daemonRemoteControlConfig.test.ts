import { describe, expect, it } from "vitest";
import { DaemonRemoteControlConfig } from "../src/host/daemonRemoteControlConfig";

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
    listAgents: async () => [{ id: "argos", name: "Argos", type: "argos" }],
    _store: store,
  };
}

describe("DaemonRemoteControlConfig (config-only host)", () => {
  it("constructs in config-only mode and lists all channels", async () => {
    const config = makeFakeConfig();
    const host = new DaemonRemoteControlConfig({ configPresenter: config as any, dataDir: "/tmp/rc-test" });
    await host.initialize();

    const channels = await host.runtime.listRemoteChannels();
    expect(channels.length).toBe(5);
    expect(channels.map((c: any) => c.id).sort()).toEqual(["discord", "feishu", "qqbot", "telegram", "weixin-ilink"]);
  });

  it("round-trips Telegram settings through the config blob", async () => {
    const config = makeFakeConfig();
    const host = new DaemonRemoteControlConfig({ configPresenter: config as any, dataDir: "/tmp/rc-test" });

    const saved = (await host.runtime.saveChannelSettings("telegram", {
      botToken: "123:ABC",
      remoteEnabled: true,
      defaultAgentId: "argos",
      defaultWorkdir: "",
    })) as any;
    expect(saved.botToken).toBe("123:ABC");
    expect(saved.remoteEnabled).toBe(true);

    const fetched = (await host.runtime.getChannelSettings("telegram")) as any;
    expect(fetched.botToken).toBe("123:ABC");

    // The settings persisted into the config blob under the remoteControl key.
    expect(config._store.remoteControl).toBeDefined();
  });

  it("createChannelPairCode issues a code and clearChannelPairCode clears it", async () => {
    const config = makeFakeConfig();
    const host = new DaemonRemoteControlConfig({ configPresenter: config as any, dataDir: "/tmp/rc-test" });

    const { code } = await host.runtime.createChannelPairCode("telegram");
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);

    const snapshot = (await host.runtime.getChannelPairingSnapshot("telegram")) as any;
    expect(snapshot.pairCode).toBe(code);

    await host.runtime.clearChannelPairCode("telegram");
    const after = (await host.runtime.getChannelPairingSnapshot("telegram")) as any;
    expect(after.pairCode).toBeNull();
  });

  it("does not start adapters in config-only mode (status reflects stopped)", async () => {
    const config = makeFakeConfig();
    const host = new DaemonRemoteControlConfig({ configPresenter: config as any, dataDir: "/tmp/rc-test" });
    await host.initialize();
    await host.runtime.saveChannelSettings("telegram", {
      botToken: "123:ABC",
      remoteEnabled: true,
      defaultAgentId: "argos",
      defaultWorkdir: "",
    });

    const status = (await host.runtime.getChannelStatus("telegram")) as any;
    // configOnly → adapter never connects → state is "stopped" or "disabled".
    expect(["stopped", "disabled"]).toContain(status.state);
  });

  it("destroy completes without error in config-only mode", async () => {
    const config = makeFakeConfig();
    const host = new DaemonRemoteControlConfig({ configPresenter: config as any, dataDir: "/tmp/rc-test" });
    await host.initialize();
    await expect(host.destroy()).resolves.toBeUndefined();
  });
});
