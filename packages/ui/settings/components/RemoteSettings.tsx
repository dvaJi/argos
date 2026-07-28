import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Switch } from "#shadcn/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { useRemoteControlPresenter, usePresenter } from "#api/presenterBridge";
import { useToast } from "#/components/use-toast";
import type { TelegramRemoteSettings, TelegramPairingSnapshot } from "@argos/shared/presenter";

type ChannelKey = "telegram" | "qqbot" | "discord" | "weixin";

const CHANNELS: { key: ChannelKey; label: string; icon: string }[] = [
  { key: "telegram", label: "Telegram", icon: "simple-icons:telegram" },
  { key: "qqbot", label: "QQ Bot", icon: "simple-icons:tencentqq" },
  { key: "discord", label: "Discord", icon: "simple-icons:discord" },
  { key: "weixin", label: "WeChat", icon: "simple-icons:wechat" },
];

export default function RemoteSettings() {
  const { toast } = useToast();
  const remoteControlPresenter = useRemoteControlPresenter();
  const configPresenter = usePresenter("configPresenter");

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
          configPresenter.listAgents().catch(() => []),
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
  }, [remoteControlPresenter]);

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
      <ScrollArea className="h-full w-full">
        <div className="flex flex-col gap-4 p-4">
          <div className="space-y-1">
            <div className="text-base font-medium">Remote Channels</div>
            <div className="text-sm text-muted-foreground">
              Configure bot connections for various platforms. These integrations do not connect Argos to another
              machine; use Machines to connect to Argos Server.
            </div>
          </div>

          <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as ChannelKey)} className="space-y-4">
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${CHANNELS.length}, minmax(0, 1fr))` }}
            >
              {CHANNELS.map((channel) => (
                <TabsTrigger key={channel.key} value={channel.key} className="flex items-center gap-2">
                  <Icon icon={channel.icon} className="w-4 h-4" />
                  <span className="hidden sm:inline">{channel.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {CHANNELS.map((channel) => {
              const enabled = channel.key === "telegram" ? Boolean(telegramSettings?.remoteEnabled) : false;
              return (
                <TabsContent key={channel.key} value={channel.key} className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <Icon icon={channel.icon} className="w-5 h-5" />
                      <div>
                        <div className="font-medium">{channel.label} Bot</div>
                        <div className="text-xs text-muted-foreground">Connect to {channel.label}</div>
                      </div>
                    </div>
                    <Switch checked={enabled} onCheckedChange={(v) => void handleToggleChannel(channel.key, v)} />
                  </div>

                  <div className="rounded-lg border p-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Configure your {channel.label} bot connection settings.
                    </p>
                    {channel.key === "telegram" && (
                      <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input
                          placeholder="Enter Telegram Bot Token"
                          type="password"
                          value={telegramSettings?.botToken ?? ""}
                          onChange={(e) =>
                            setTelegramSettings((prev) => (prev ? { ...prev, botToken: e.target.value } : prev))
                          }
                        />
                      </div>
                    )}
                    {channel.key === "telegram" && (
                      <div className="space-y-2">
                        <Label>Default agent</Label>
                        <Select
                          value={telegramSettings?.defaultAgentId ?? ""}
                          onValueChange={(v) => void handleTelegramAgentChange(v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select an agent" />
                          </SelectTrigger>
                          <SelectContent>
                            {agents.map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          The agent must have a default model set (Settings &gt; Agents).
                        </p>
                      </div>
                    )}
                    {channel.key === "discord" && (
                      <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input placeholder="Enter Discord Bot Token" type="password" disabled />
                      </div>
                    )}
                    {(channel.key === "qqbot" || channel.key === "weixin") && (
                      <div className="text-sm text-muted-foreground">Configuration options for {channel.label}</div>
                    )}
                    <Button size="sm" disabled={saving} onClick={() => void handleSaveConfig(channel.key)}>
                      Save Configuration
                    </Button>
                  </div>

                  {channel.key === "telegram" && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <div>
                        <div className="text-sm font-medium">Account pairing</div>
                        <div className="text-xs text-muted-foreground">
                          Generate a code, then send it to your bot in Telegram to link your account.
                        </div>
                      </div>
                      {telegramPairing?.pairCode ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-widest">
                              {telegramPairing.pairCode}
                            </code>
                            <Button variant="outline" size="sm" onClick={() => void handleCopyPairCode()}>
                              Copy
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pairBusy}
                              onClick={() => void handleClearPairCode()}
                            >
                              Clear
                            </Button>
                          </div>
                          {telegramPairing.pairCodeExpiresAt ? (
                            <div className="text-xs text-muted-foreground">
                              Expires {new Date(telegramPairing.pairCodeExpiresAt).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pairBusy}
                          onClick={() => void handleGeneratePairCode()}
                        >
                          {pairBusy ? "Generating..." : "Generate pair code"}
                        </Button>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Paired accounts: {telegramPairing?.allowedUserIds?.length ?? 0}
                      </div>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
