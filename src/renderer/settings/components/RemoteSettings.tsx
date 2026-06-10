import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shadcn/components/ui/tabs";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { useToast } from "@/components/use-toast";

type ChannelKey = "telegram" | "feishu" | "qqbot" | "discord" | "weixin";

interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export default function RemoteSettings() {
  const { toast } = useToast();
  const configPresenter = useLegacyPresenter("configPresenter");

  const [isLoading, setIsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<ChannelKey>("telegram");
  const [channelConfigs, setChannelConfigs] = useState<Record<ChannelKey, ChannelConfig>>({
    telegram: { enabled: false },
    feishu: { enabled: false },
    qqbot: { enabled: false },
    discord: { enabled: false },
    weixin: { enabled: false },
  });

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const settings = await (configPresenter as any).getRemoteSettings();
        if (settings) {
          setChannelConfigs((prev) => ({
            telegram: {
              ...prev.telegram,
              ...settings.telegram,
              enabled: settings.telegram?.enabled ?? false,
            },
            feishu: {
              ...prev.feishu,
              ...settings.feishu,
              enabled: settings.feishu?.enabled ?? false,
            },
            qqbot: { ...prev.qqbot, ...settings.qqbot, enabled: settings.qqbot?.enabled ?? false },
            discord: {
              ...prev.discord,
              ...settings.discord,
              enabled: settings.discord?.enabled ?? false,
            },
            weixin: {
              ...prev.weixin,
              ...settings.weixin,
              enabled: settings.weixin?.enabled ?? false,
            },
          }));
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    };
    loadConfigs();
  }, []);

  const channels: { key: ChannelKey; label: string; icon: string }[] = [
    { key: "telegram", label: "Telegram", icon: "simple-icons:telegram" },
    { key: "feishu", label: "Feishu", icon: "simple-icons:feishu" },
    { key: "qqbot", label: "QQ Bot", icon: "simple-icons:tencentqq" },
    { key: "discord", label: "Discord", icon: "simple-icons:discord" },
    { key: "weixin", label: "WeChat", icon: "simple-icons:wechat" },
  ];

  const handleToggleChannel = async (key: ChannelKey, enabled: boolean) => {
    setChannelConfigs((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled },
    }));
    try {
      await (configPresenter as any).setRemoteChannelEnabled(key, enabled);
      toast({
        title: `${channels.find((c) => c.key === key)?.label} ${enabled ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      toast({ title: "Operation failed", description: String(error), variant: "destructive" });
    }
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
            <div className="text-sm text-muted-foreground">Configure bot connections for various platforms</div>
          </div>

          <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as ChannelKey)} className="space-y-4">
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${channels.length}, minmax(0, 1fr))` }}
            >
              {channels.map((channel) => (
                <TabsTrigger key={channel.key} value={channel.key} className="flex items-center gap-2">
                  <Icon icon={channel.icon} className="w-4 h-4" />
                  <span className="hidden sm:inline">{channel.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {channels.map((channel) => (
              <TabsContent key={channel.key} value={channel.key} className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Icon icon={channel.icon} className="w-5 h-5" />
                    <div>
                      <div className="font-medium">{channel.label} Bot</div>
                      <div className="text-xs text-muted-foreground">Connect to {channel.label}</div>
                    </div>
                  </div>
                  <Switch
                    checked={channelConfigs[channel.key].enabled}
                    onCheckedChange={(v) => handleToggleChannel(channel.key, v)}
                  />
                </div>

                <div className="rounded-lg border p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure your {channel.label} bot connection settings.
                  </p>
                  {channel.key === "telegram" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input placeholder="Enter Telegram Bot Token" type="password" />
                      </div>
                    </div>
                  )}
                  {channel.key === "discord" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input placeholder="Enter Discord Bot Token" type="password" />
                      </div>
                    </div>
                  )}
                  {(channel.key === "feishu" || channel.key === "qqbot" || channel.key === "weixin") && (
                    <div className="text-sm text-muted-foreground">Configuration options for {channel.label}</div>
                  )}
                  <Button size="sm" onClick={() => toast({ title: "Saved" })}>
                    Save Configuration
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-auto ${className || ""}`}>{children}</div>;
}
