import { useEffect, useMemo, useState } from "react";
import { createConfigClient } from "#api/ConfigClient";
import { useRemoteControlPresenter } from "#api/presenterBridge";
import { useToast } from "#/components/use-toast";
import type { TelegramRemoteSettings, TelegramPairingSnapshot } from "@argos/shared/presenter";
import { CHANNELS, type ChannelKey } from "./remote/channelMeta";
import { ChannelOverviewCard, type ChannelStatus } from "./remote/ChannelOverviewCard";
import { ChannelConfigPanel, type ChannelConfigHandlers } from "./remote/ChannelConfigPanel";
import "./remote/remote-channels.css";

function deriveStatus(
  channel: ChannelKey,
  telegramSettings: TelegramRemoteSettings | null,
  telegramPairing: TelegramPairingSnapshot | null,
): ChannelStatus {
  if (channel !== "telegram") return "not-configured";
  if (telegramSettings?.remoteEnabled) {
    return telegramPairing?.allowedUserIds?.length ? "connected" : "enabled";
  }
  return telegramSettings?.botToken ? "enabled" : "not-configured";
}

export default function RemoteSettings() {
  const { toast } = useToast();
  const remoteControlPresenter = useRemoteControlPresenter();
  const configClient = useMemo(() => createConfigClient(), []);

  const [isLoading, setIsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<ChannelKey>("telegram");
  const [telegramSettings, setTelegramSettings] = useState<TelegramRemoteSettings | null>(null);
  const [telegramPairing, setTelegramPairing] = useState<TelegramPairingSnapshot | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [settings, pairing, agentList] = await Promise.all([
          remoteControlPresenter.getTelegramSettings(),
          remoteControlPresenter.getTelegramPairingSnapshot().catch(() => null),
          configClient.listAgents().catch(() => []),
        ]);
        if (!cancelled) {
          setTelegramSettings(settings);
          setTelegramPairing(pairing);
          setAgents(
            (agentList ?? []).map((agent: { id: string; name: string }) => ({ id: agent.id, name: agent.name })),
          );
        }
      } catch {
        // leave defaults if the backend has none yet
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [remoteControlPresenter, configClient]);

  const saveTelegram = async (next: TelegramRemoteSettings) => {
    setSaving(true);
    try {
      const saved = await remoteControlPresenter.saveTelegramSettings(next);
      setTelegramSettings(saved);
      toast({ title: "Telegram settings saved" });
    } catch (error) {
      toast({ title: "Failed to save", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const refreshTelegramPairing = async () => {
    try {
      const snapshot = await remoteControlPresenter.getTelegramPairingSnapshot();
      setTelegramPairing(snapshot);
    } catch {
      // ignore
    }
  };

  const handleGeneratePairCode = async () => {
    setPairBusy(true);
    try {
      await remoteControlPresenter.createTelegramPairCode();
      await refreshTelegramPairing();
    } catch (error) {
      toast({ title: "Failed to generate pair code", description: String(error), variant: "destructive" });
    } finally {
      setPairBusy(false);
    }
  };

  const handleClearPairCode = async () => {
    setPairBusy(true);
    try {
      await remoteControlPresenter.clearTelegramPairCode();
      await refreshTelegramPairing();
    } catch (error) {
      toast({ title: "Failed to clear pair code", description: String(error), variant: "destructive" });
    } finally {
      setPairBusy(false);
    }
  };

  const handleCopyPairCode = async () => {
    const code = telegramPairing?.pairCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Pair code copied" });
    } catch {
      // ignore
    }
  };

  const handleTelegramAgentChange = async (agentId: string) => {
    if (!telegramSettings) return;
    const next = { ...telegramSettings, defaultAgentId: agentId };
    setTelegramSettings(next);
    await saveTelegram(next);
  };

  const handleTokenChange = (token: string) => {
    setTelegramSettings((prev) => (prev ? { ...prev, botToken: token } : prev));
  };

  const handleToggleChannel = async (key: ChannelKey, enabled: boolean) => {
    if (key === "telegram" && telegramSettings) {
      const next = { ...telegramSettings, remoteEnabled: enabled };
      setTelegramSettings(next);
      await saveTelegram(next);
      return;
    }
    toast({ title: `${CHANNELS.find((c) => c.key === key)?.label} configuration is not yet available` });
  };

  const handleSaveConfig = async (key: ChannelKey) => {
    if (key === "telegram" && telegramSettings) {
      await saveTelegram(telegramSettings);
      return;
    }
    toast({ title: `${CHANNELS.find((c) => c.key === key)?.label} configuration is not yet available` });
  };

  const statuses = useMemo(
    () =>
      Object.fromEntries(
        CHANNELS.map((channel) => [channel.key, deriveStatus(channel.key, telegramSettings, telegramPairing)]),
      ) as Record<ChannelKey, ChannelStatus>,
    [telegramSettings, telegramPairing],
  );

  const configHandlers: ChannelConfigHandlers = {
    saving,
    pairBusy,
    agents,
    onSave: (channel) => void handleSaveConfig(channel),
    onToggle: (channel, enabled) => void handleToggleChannel(channel, enabled),
    onTokenChange: handleTokenChange,
    onAgentChange: (_channel, agentId) => void handleTelegramAgentChange(agentId),
    onGeneratePairCode: () => void handleGeneratePairCode(),
    onClearPairCode: () => void handleClearPairCode(),
    onCopyPairCode: () => void handleCopyPairCode(),
  };

  if (isLoading) {
    return (
      <div data-testid="settings-remote-page" className="h-full w-full p-4 space-y-4 animate-pulse">
        <div className="h-6 w-48 rounded bg-muted/50" />
        <div className="h-20 rounded-xl bg-muted/40" />
        <div className="h-80 rounded-xl bg-muted/20" />
      </div>
    );
  }

  return (
    <div data-testid="settings-remote-page" className="h-full w-full">
      <div className="h-full w-full overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 lg:p-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Remote Channels</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Configure bot connections for various platforms. These integrations do not connect Argos to another
              machine; use Machines to connect to Argos Server.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNELS.map((channel) => {
              const status = statuses[channel.key];
              return (
                <ChannelOverviewCard
                  key={channel.key}
                  channel={channel}
                  status={status}
                  active={activeChannel === channel.key}
                  disabled={saving || pairBusy}
                  paired={Boolean(telegramPairing?.allowedUserIds?.length)}
                  onToggle={(enabled) => void handleToggleChannel(channel.key, enabled)}
                  onSelect={() => setActiveChannel(channel.key)}
                />
              );
            })}
          </div>

          <ChannelConfigPanel
            channelKey={activeChannel}
            telegramSettings={telegramSettings}
            telegramPairing={telegramPairing}
            handlers={configHandlers}
          />
        </div>
      </div>
    </div>
  );
}
