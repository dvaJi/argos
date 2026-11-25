import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Switch } from "#shadcn/components/ui/switch";
import { useToast } from "#/components/use-toast";
import AgentCombobox from "#/components/AgentCombobox";
import FieldHelpPopover from "#/components/FieldHelpPopover";
import SessionPickerDialog from "#/components/SessionPickerDialog";
import { createConfigClient } from "#api/ConfigClient";
import { createDeviceClient } from "#api/DeviceClient";
import { createSettingsClient } from "#api/SettingsClient";
import { createTriggersClient } from "#api/TriggersClient";
import type { Agent, SessionWithState } from "@argos/shared/types/agent-interface";
import type { TriggerRecord, TriggerUpsertInput } from "@argos/shared/triggers";
import SettingsPageShell from "./control-center/SettingsPageShell";

const triggersClient = createTriggersClient();
const configClient = createConfigClient();
const deviceClient = createDeviceClient();
const settingsClient = createSettingsClient();
const DAEMON_ORIGIN = "http://127.0.0.1:9527";

type Tab = "webhooks" | "folders" | "schedules";

function emptyDraft(tab: Tab): TriggerUpsertInput {
  return {
    name: tab === "folders" ? "Folder watch" : "Webhook",
    type: tab === "folders" ? "folder" : "webhook",
    config: tab === "folders" ? { path: "" } : {},
    prompt: "",
    agentId: "argos",
    sessionId: null,
    trust: "outside",
    enabled: true,
  };
}

export default function TriggersSettings() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("webhooks");
  const [triggers, setTriggers] = useState<TriggerRecord[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draft, setDraft] = useState<TriggerUpsertInput>(() => emptyDraft("webhooks"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithState | null>(null);
  const agentOptions =
    agents.length > 0
      ? agents
      : [{ id: "argos", name: "Argos", type: "argos" as const, enabled: true } as Agent];

  const load = async () => {
    setLoading(true);
    try {
      const [nextTriggers, nextAgents] = await Promise.all([triggersClient.list(), configClient.listAgents()]);
      setTriggers(nextTriggers);
      setAgents(nextAgents.filter((agent) => agent.enabled));
    } catch (error) {
      toast({
        title: "Could not load triggers",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextTriggers, nextAgents] = await Promise.all([triggersClient.list(), configClient.listAgents()]);
        if (cancelled) return;
        setTriggers(nextTriggers);
        setAgents(nextAgents.filter((agent) => agent.enabled));
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Could not load triggers",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setDraft(emptyDraft(next));
    setSelectedSession(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      await triggersClient.upsert(draft);
      setDraft(emptyDraft(tab));
      setSelectedSession(null);
      await load();
      toast({ title: "Trigger saved" });
    } catch (error) {
      toast({
        title: "Could not save trigger",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const browseFolder = async () => {
    try {
      const result = await deviceClient.selectDirectory();
      if (!result.canceled && result.filePaths[0]) {
        setDraft((prev) => ({ ...prev, config: { ...prev.config, path: result.filePaths[0] } }));
      }
    } catch (error) {
      toast({
        title: "Could not open the folder picker",
        description:
          error instanceof Error ? error.message : "Folder browsing is only available in the Argos desktop app.",
        variant: "destructive",
      });
    }
  };

  const remove = async (id: string) => {
    await triggersClient.remove(id);
    await load();
  };

  const toggle = async (trigger: TriggerRecord, enabled: boolean) => {
    await triggersClient.toggle(trigger.id, enabled);
    await load();
  };

  const visible = triggers.filter((trigger) => (tab === "folders" ? trigger.type === "folder" : trigger.type === "webhook"));

  return (
    <SettingsPageShell
      data-testid="settings-triggers-page"
      title="Triggers"
      eyebrow="Tools"
      description="Start an agent from a webhook, a folder, or a schedule"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(["webhooks", "folders", "schedules"] as Tab[]).map((item) => (
          <Button
            key={item}
            variant={tab === item ? "secondary" : "ghost"}
            size="sm"
            onClick={() => switchTab(item)}
            className="capitalize"
          >
            {item}
          </Button>
        ))}
      </div>

      {tab === "schedules" ? (
        <section className="space-y-3 rounded-lg border bg-card/40 p-4">
          <div className="text-sm font-medium">Schedules live in Scheduled Tasks</div>
          <p className="text-sm text-muted-foreground">
            Cron, daily, weekly, and one-time prompts are managed on the Scheduled Tasks page. They can create a new
            session or run in an existing one.
          </p>
          <Button
            size="sm"
            onClick={() => void settingsClient.openSettings({ routeName: "settings-scheduled-tasks" })}
          >
            Open Scheduled Tasks
          </Button>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <section className="space-y-3 rounded-lg border bg-card/40 p-4">
            <div className="text-sm font-medium">{tab === "folders" ? "Folder watches" : "Webhooks"}</div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No {tab === "folders" ? "folder watches" : "webhooks"} yet.
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((trigger) => (
                  <div key={trigger.id} className="rounded-md border bg-background/60 p-3">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={trigger.type === "folder" ? "lucide:folder-search" : "lucide:webhook"}
                        className="h-4 w-4 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{trigger.name}</span>
                      <Switch checked={trigger.enabled} onCheckedChange={(value) => void toggle(trigger, value)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(trigger.id)}>
                        <Icon icon="lucide:trash-2" className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>
                        Agent: <span className="text-foreground">{trigger.agentId}</span>
                        {trigger.sessionId ? ` · session ${trigger.sessionId.slice(0, 8)}` : " · new session"}
                      </div>
                      <div>Trust: {trigger.trust === "outside" ? "outside content (read-only)" : "owner"}</div>
                      {trigger.type === "folder" && <div>Folder: {trigger.config.path}</div>}
                      {trigger.webhookPath && (
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-muted px-1 py-0.5">{DAEMON_ORIGIN + trigger.webhookPath}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => void navigator.clipboard.writeText(DAEMON_ORIGIN + trigger.webhookPath!)}
                          >
                            Copy URL
                          </Button>
                          {trigger.secret && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => void navigator.clipboard.writeText(trigger.secret!)}
                            >
                              Copy secret
                            </Button>
                          )}
                        </div>
                      )}
                      {trigger.lastError && <div className="text-destructive">Last error: {trigger.lastError}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border bg-card/40 p-4">
            <div className="text-sm font-medium">New {tab === "folders" ? "folder watch" : "webhook"}</div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                className="h-8!"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            {tab === "folders" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Folder path</Label>
                  <div className="flex gap-1.5">
                    <Input
                      className="h-8! min-w-0 flex-1"
                      placeholder="/path/to/watch"
                      value={draft.config.path ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, config: { ...prev.config, path: e.target.value } }))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => void browseFolder()}
                    >
                      <Icon icon="lucide:folder-open" className="size-3.5" />
                      Browse
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">File pattern</Label>
                  <Input
                    className="h-8!"
                    placeholder="*.pdf (optional)"
                    value={draft.config.pattern ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, config: { ...prev.config, pattern: e.target.value } }))
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The URL and bearer secret are generated after saving. Send a POST to start the agent.
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prompt</Label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What should the agent do when this trigger fires?"
                value={draft.prompt}
                onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Agent</Label>
                <AgentCombobox
                  agents={agentOptions}
                  value={draft.agentId}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, agentId: value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Existing session (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full justify-between px-3 text-left font-normal"
                  onClick={() => setSessionDialogOpen(true)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon icon="lucide:message-square" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">
                      {selectedSession?.title || draft.sessionId || "Create a new session"}
                    </span>
                  </span>
                  <Icon icon="lucide:search" className="size-4 shrink-0 opacity-50" />
                </Button>
                {draft.sessionId && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, sessionId: null }));
                      setSelectedSession(null);
                    }}
                  >
                    Clear session
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Trust</Label>
                <FieldHelpPopover title="Trigger trust">
                  <p>
                    <span className="font-medium text-foreground">Outside content</span> (default): the trigger is
                    untrusted. The agent gets read-only tools only — read, grep, find, ls — with no shell, edits, MCP,
                    delegation, or setup tools. Use this for webhooks, watched folders, and anything a stranger can
                    write.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Owner</span>: the trigger acts as you. The agent gets
                    its normal tool set and permission mode. Use this only for sources only you control, such as a
                    private webhook secret or a folder on this machine.
                  </p>
                  <p>
                    When an outside trigger targets an existing session, that session becomes restricted for the next
                    run. New sessions from an outside trigger start restricted.
                  </p>
                </FieldHelpPopover>
              </div>
              <Select
                value={draft.trust}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, trust: value as "owner" | "outside" }))}
              >
                <SelectTrigger className="h-8! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outside">Outside content — read-only tools</SelectItem>
                  <SelectItem value="owner">Owner — full tools</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" disabled={saving || !draft.name.trim() || !draft.prompt.trim()} onClick={() => void save()}>
              {saving ? "Saving…" : "Save trigger"}
            </Button>
          </section>
        </div>
      )}
      <SessionPickerDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        value={draft.sessionId}
        onSelect={(session) => {
          setDraft((prev) => ({ ...prev, sessionId: session.id }));
          setSelectedSession(session);
        }}
        onClear={() => {
          setDraft((prev) => ({ ...prev, sessionId: null }));
          setSelectedSession(null);
        }}
      />
    </SettingsPageShell>
  );
}
