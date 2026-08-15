import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import type { TelegramPairingSnapshot, TelegramRemoteSettings } from "@argos/shared/presenter";
import { getChannel, type ChannelKey } from "./channelMeta";
import "./remote-channels.css";

export type ChannelConfigHandlers = {
  saving: boolean;
  pairBusy: boolean;
  agents: { id: string; name: string }[];
  onSave: (channel: ChannelKey) => void;
  onToggle: (channel: ChannelKey, enabled: boolean) => void;
  onTokenChange: (token: string) => void;
  onAgentChange: (channel: ChannelKey, agentId: string) => void;
  onGeneratePairCode: () => void;
  onClearPairCode: () => void;
  onCopyPairCode: () => void;
};

type ChannelConfigPanelProps = {
  channelKey: ChannelKey;
  telegramSettings: TelegramRemoteSettings | null;
  telegramPairing: TelegramPairingSnapshot | null;
  handlers: ChannelConfigHandlers;
};

function CopyButton({ onCopy }: { onCopy: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={copied ? "rc-copy-feedback border-green-500/40" : ""}
      aria-label={copied ? "Pair code copied" : "Copy pair code"}
    >
      <Icon icon={copied ? "lucide:check" : "lucide:copy"} className="size-3.5" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function TelegramPairingCard({
  pairing,
  pairBusy,
  onGenerate,
  onClear,
  onCopy,
}: {
  pairing: TelegramPairingSnapshot | null;
  pairBusy: boolean;
  onGenerate: () => void;
  onClear: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:key-round" className="size-4 text-muted-foreground" />
        <div className="text-sm font-medium">Account pairing</div>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Generate a code, then send it to your bot in Telegram to link your account.
      </p>
      <div className="mt-3 space-y-2">
        {pairing?.pairCode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-sm tracking-widest">
                {pairing.pairCode}
              </code>
              <CopyButton onCopy={onCopy} />
              <Button variant="ghost" size="sm" disabled={pairBusy} onClick={onClear}>
                Clear
              </Button>
            </div>
            {pairing.pairCodeExpiresAt ? (
              <div className="text-xs tabular-nums text-muted-foreground">
                Expires {new Date(pairing.pairCodeExpiresAt).toLocaleString()}
              </div>
            ) : null}
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={pairBusy} onClick={onGenerate}>
            {pairBusy ? "Generating..." : "Generate pair code"}
          </Button>
        )}
        <div className="text-xs text-muted-foreground">Paired accounts: {pairing?.allowedUserIds?.length ?? 0}</div>
      </div>
    </div>
  );
}

export function ChannelConfigPanel({
  channelKey,
  telegramSettings,
  telegramPairing,
  handlers,
}: ChannelConfigPanelProps) {
  const channel = getChannel(channelKey);
  const isTelegram = channelKey === "telegram";
  const saving = handlers.saving;

  useEffect(() => {
    const panel = document.getElementById(`remote-channel-config-${channelKey}`);
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [channelKey]);

  return (
    <section
      id={`remote-channel-config-${channelKey}`}
      data-testid={`remote-channel-config-${channelKey}`}
      className="rc-panel-enter space-y-4"
    >
      <div className="flex items-center gap-3">
        <span
          className="rc-icon-tile flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors duration-200"
          style={{ color: channel.brandColor, backgroundColor: `${channel.brandColor}1A` }}
        >
          <Icon icon={channel.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Configure {channel.label}</div>
          <div className="text-xs text-muted-foreground">{channel.description}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Connect to {channel.label}.</p>

          {isTelegram && (
            <div className="space-y-2">
              <Label htmlFor={`${channelKey}-bot-token`}>Bot Token</Label>
              <Input
                id={`${channelKey}-bot-token`}
                placeholder="Enter Telegram Bot Token"
                type="password"
                value={telegramSettings?.botToken ?? ""}
                onChange={(event) => handlers.onTokenChange?.(event.target.value)}
              />
            </div>
          )}

          {isTelegram && (
            <div className="space-y-2">
              <Label htmlFor={`${channelKey}-default-agent`}>Default agent</Label>
              <Select
                value={telegramSettings?.defaultAgentId ?? ""}
                onValueChange={(value) => handlers.onAgentChange(channelKey, value ?? "")}
              >
                <SelectTrigger className="h-9 w-full" id={`${channelKey}-default-agent`}>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {handlers.agents.map((agent) => (
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

          {channelKey === "discord" && (
            <div className="space-y-2">
              <Label htmlFor="discord-bot-token">Bot Token</Label>
              <Input id="discord-bot-token" placeholder="Enter Discord Bot Token" type="password" disabled />
            </div>
          )}

          {(channelKey === "qqbot" || channelKey === "weixin") && (
            <div className="text-sm text-muted-foreground">Configuration options for {channel.label}</div>
          )}

          <Button size="sm" disabled={saving} onClick={() => handlers.onSave(channelKey)}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </div>

      {isTelegram && (
        <TelegramPairingCard
          pairing={telegramPairing}
          pairBusy={handlers.pairBusy}
          onGenerate={handlers.onGeneratePairCode}
          onClear={handlers.onClearPairCode}
          onCopy={handlers.onCopyPairCode}
        />
      )}
    </section>
  );
}
