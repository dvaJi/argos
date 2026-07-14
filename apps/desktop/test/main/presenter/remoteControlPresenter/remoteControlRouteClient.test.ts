import { describe, expect, it, vi } from "vitest";
import { RemoteControlRouteClient } from "@argos/client-sdk";

describe("RemoteControlRouteClient", () => {
  it("maps legacy presenter methods to daemon remote routes", async () => {
    const invoke = vi.fn(async (route: string) => {
      if (route === "remote.listChannels") return { channels: [{ id: "telegram" }] };
      if (route === "remote.saveChannelSettings") return { settings: { remoteEnabled: false } };
      return {};
    });
    const client = new RemoteControlRouteClient(invoke);

    await expect(client.listRemoteChannels()).resolves.toEqual([{ id: "telegram" }]);
    await expect(
      client.saveTelegramSettings({
        botToken: "",
        remoteEnabled: false,
        defaultAgentId: "argos",
        defaultWorkdir: "",
      }),
    ).resolves.toEqual({ remoteEnabled: false });

    expect(invoke).toHaveBeenNthCalledWith(1, "remote.listChannels", {});
    expect(invoke).toHaveBeenNthCalledWith(2, "remote.saveChannelSettings", {
      channel: "telegram",
      settings: {
        botToken: "",
        remoteEnabled: false,
        defaultAgentId: "argos",
        defaultWorkdir: "",
      },
    });
  });
});
