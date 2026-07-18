import type {
  ChannelSettingsMap,
  DiscordRemoteSettings,
  DiscordRemoteStatus,
  DiscordPairingSnapshot,
  IRemoteControlPresenter,
  PairableRemoteChannel,
  RemoteBindingSummary,
  RemoteChannel,
  RemoteChannelDescriptor,
  RemoteChannelStatus,
  RemotePairingSnapshot,
  QQBotPairingSnapshot,
  QQBotRemoteStatus,
  TelegramPairingSnapshot,
  TelegramRemoteBindingSummary,
  TelegramRemoteSettings,
  TelegramRemoteStatus,
  WeixinIlinkLoginResult,
  WeixinIlinkLoginSession,
  WeixinIlinkRemoteSettings,
  WeixinIlinkRemoteStatus,
} from "@argos/shared/presenter";

export type RemoteControlRouteInvoker = (route: string, input: unknown) => Promise<unknown>;

/** Compatibility client for legacy presenter consumers; all state remains daemon-owned. */
export class RemoteControlRouteClient implements IRemoteControlPresenter {
  constructor(private readonly invoke: RemoteControlRouteInvoker) {}

  private async output<T>(route: string, input: unknown, key: string): Promise<T> {
    const result = (await this.invoke(route, input)) as Record<string, unknown>;
    return result[key] as T;
  }

  listRemoteChannels(): Promise<RemoteChannelDescriptor[]> {
    return this.output("remote.listChannels", {}, "channels");
  }

  getChannelSettings<T extends RemoteChannel>(channel: T): Promise<ChannelSettingsMap[T]> {
    return this.output("remote.getChannelSettings", { channel }, "settings");
  }

  saveChannelSettings<T extends RemoteChannel>(
    channel: T,
    settings: ChannelSettingsMap[T],
  ): Promise<ChannelSettingsMap[T]> {
    return this.output("remote.saveChannelSettings", { channel, settings }, "settings");
  }

  getChannelStatus(channel: "telegram"): Promise<TelegramRemoteStatus>;
  getChannelStatus(channel: "qqbot"): Promise<QQBotRemoteStatus>;
  getChannelStatus(channel: "discord"): Promise<DiscordRemoteStatus>;
  getChannelStatus(channel: "weixin-ilink"): Promise<WeixinIlinkRemoteStatus>;
  getChannelStatus(channel: RemoteChannel): Promise<RemoteChannelStatus>;
  getChannelStatus(channel: RemoteChannel): Promise<RemoteChannelStatus> {
    return this.output("remote.getChannelStatus", { channel }, "status");
  }

  getChannelBindings(channel: RemoteChannel): Promise<RemoteBindingSummary[]> {
    return this.output("remote.getChannelBindings", { channel }, "bindings");
  }

  async removeChannelBinding(channel: RemoteChannel, endpointKey: string): Promise<void> {
    await this.invoke("remote.removeChannelBinding", { channel, endpointKey });
  }

  async removeChannelPrincipal(channel: PairableRemoteChannel, principalId: string): Promise<void> {
    await this.invoke("remote.removeChannelPrincipal", { channel, principalId });
  }

  getChannelPairingSnapshot(channel: "telegram"): Promise<TelegramPairingSnapshot>;
  getChannelPairingSnapshot(channel: "qqbot"): Promise<QQBotPairingSnapshot>;
  getChannelPairingSnapshot(channel: "discord"): Promise<DiscordPairingSnapshot>;
  getChannelPairingSnapshot(channel: PairableRemoteChannel): Promise<RemotePairingSnapshot>;
  getChannelPairingSnapshot(channel: PairableRemoteChannel): Promise<RemotePairingSnapshot> {
    return this.output("remote.getChannelPairing", { channel }, "snapshot");
  }

  createChannelPairCode(channel: PairableRemoteChannel): Promise<{ code: string; expiresAt: number }> {
    return this.invoke("remote.createPairCode", { channel }) as Promise<{ code: string; expiresAt: number }>;
  }

  async clearChannelPairCode(channel: PairableRemoteChannel): Promise<void> {
    await this.invoke("remote.clearPairCode", { channel });
  }

  clearChannelBindings(channel: RemoteChannel): Promise<number> {
    return this.output("remote.clearBindings", { channel }, "count");
  }

  getTelegramSettings(): Promise<TelegramRemoteSettings> {
    return this.getChannelSettings("telegram");
  }

  saveTelegramSettings(input: TelegramRemoteSettings): Promise<TelegramRemoteSettings> {
    return this.saveChannelSettings("telegram", input);
  }

  getTelegramStatus(): Promise<TelegramRemoteStatus> {
    return this.getChannelStatus("telegram") as Promise<TelegramRemoteStatus>;
  }

  getTelegramBindings(): Promise<TelegramRemoteBindingSummary[]> {
    return this.getChannelBindings("telegram") as unknown as Promise<TelegramRemoteBindingSummary[]>;
  }

  removeTelegramBinding(endpointKey: string): Promise<void> {
    return this.removeChannelBinding("telegram", endpointKey);
  }

  getTelegramPairingSnapshot(): Promise<TelegramPairingSnapshot> {
    return this.getChannelPairingSnapshot("telegram") as Promise<TelegramPairingSnapshot>;
  }

  createTelegramPairCode(): Promise<{ code: string; expiresAt: number }> {
    return this.createChannelPairCode("telegram");
  }

  clearTelegramPairCode(): Promise<void> {
    return this.clearChannelPairCode("telegram");
  }

  clearTelegramBindings(): Promise<number> {
    return this.clearChannelBindings("telegram");
  }

  getDiscordSettings(): Promise<DiscordRemoteSettings> {
    return this.getChannelSettings("discord");
  }

  saveDiscordSettings(input: DiscordRemoteSettings): Promise<DiscordRemoteSettings> {
    return this.saveChannelSettings("discord", input);
  }

  getDiscordStatus(): Promise<DiscordRemoteStatus> {
    return this.getChannelStatus("discord") as Promise<DiscordRemoteStatus>;
  }

  getWeixinIlinkSettings(): Promise<WeixinIlinkRemoteSettings> {
    return this.getChannelSettings("weixin-ilink");
  }

  saveWeixinIlinkSettings(input: WeixinIlinkRemoteSettings): Promise<WeixinIlinkRemoteSettings> {
    return this.saveChannelSettings("weixin-ilink", input);
  }

  getWeixinIlinkStatus(): Promise<WeixinIlinkRemoteStatus> {
    return this.getChannelStatus("weixin-ilink") as Promise<WeixinIlinkRemoteStatus>;
  }

  startWeixinIlinkLogin(input: { force?: boolean } = {}): Promise<WeixinIlinkLoginSession> {
    return this.invoke("remote.weixin.startLogin", input) as Promise<WeixinIlinkLoginSession>;
  }

  waitForWeixinIlinkLogin(input: { sessionKey: string; timeoutMs?: number }): Promise<WeixinIlinkLoginResult> {
    return this.invoke("remote.weixin.waitForLogin", input) as Promise<WeixinIlinkLoginResult>;
  }

  async removeWeixinIlinkAccount(accountId: string): Promise<void> {
    await this.invoke("remote.weixin.removeAccount", { accountId });
  }

  async restartWeixinIlinkAccount(accountId: string): Promise<void> {
    await this.invoke("remote.weixin.restartAccount", { accountId });
  }
}
