import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shadcn/components/ui/collapsible";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Switch } from "#shadcn/components/ui/switch";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { useToast } from "#/components/use-toast";
import { createConfigClient } from "#api/ConfigClient";
import type {
  HookCommandItem,
  HookEventName,
  HookTestResult,
  HooksNotificationsSettings,
} from "@argos/shared/hooksNotifications";
import { DEFAULT_IMPORTANT_HOOK_EVENTS, HOOK_EVENT_NAMES } from "@argos/shared/hooksNotifications";

const configClient = createConfigClient();

const PREVIEW_LIMIT = 200;

const stdinPreview = `{
  "event": "SessionStart",
  "time": "2026-04-13T00:00:00.000Z",
  "session": {
    "conversationId": "session-123",
    "workdir": "/path/to/project"
  },
  "user": null,
  "tool": null
}`;

const placeholderDocs = [
  { token: "{{event}}", field: "event" },
  { token: "{{time}}", field: "time" },
  { token: "{{isTest}}", field: "isTest" },
  { token: "{{conversationId}}", field: "conversationId" },
  { token: "{{workdir}}", field: "workdir" },
  { token: "{{agentId}}", field: "agentId" },
  { token: "{{providerId}}", field: "providerId" },
  { token: "{{modelId}}", field: "modelId" },
  { token: "{{messageId}}", field: "messageId" },
  { token: "{{toolName}}", field: "toolName" },
  { token: "{{toolCallId}}", field: "toolCallId" },
];

const envDocs = [
  { token: "ARGOS_HOOK_EVENT", field: "event" },
  { token: "ARGOS_HOOK_TIME", field: "time" },
  { token: "ARGOS_HOOK_IS_TEST", field: "isTest" },
  { token: "ARGOS_CONVERSATION_ID", field: "conversationId" },
  { token: "ARGOS_WORKDIR", field: "workdir" },
  { token: "ARGOS_AGENT_ID", field: "agentId" },
  { token: "ARGOS_PROVIDER_ID", field: "providerId" },
  { token: "ARGOS_MODEL_ID", field: "modelId" },
  { token: "ARGOS_MESSAGE_ID", field: "messageId" },
  { token: "ARGOS_TOOL_NAME", field: "toolName" },
  { token: "ARGOS_TOOL_CALL_ID", field: "toolCallId" },
];

const commandExamples = [
  { label: "Node.js", command: "node scripts/hook.js {{event}} {{conversationId}}" },
  {
    label: "Python",
    command: "python scripts/hook.py --event {{event}} --session {{conversationId}}",
  },
  { label: "PowerShell", command: "powershell -File scripts/hook.ps1 {{event}} {{isTest}}" },
];

const fieldDescriptions: Record<string, string> = {
  event: "The hook event name",
  time: "ISO 8601 timestamp",
  isTest: "Whether this is a test invocation",
  conversationId: "The conversation/session ID",
  workdir: "The working directory",
  agentId: "The agent ID",
  providerId: "The provider ID",
  modelId: "The model ID",
  messageId: "The message ID",
  toolName: "The tool name (for tool events)",
  toolCallId: "The tool call ID",
};

const eventLabels: Record<string, string> = Object.fromEntries(HOOK_EVENT_NAMES.map((name) => [name, name]));

export default function NotificationsHooksSettings() {
  const { toast } = useToast();

  const [config, setConfig] = useState<HooksNotificationsSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, HookTestResult | null>>({});
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<HooksNotificationsSettings | null>(null);

  const persistConfig = async (nextConfig?: HooksNotificationsSettings) => {
    const configToSave = nextConfig ?? config;
    if (!configToSave) return;
    if (saveInFlightRef.current) {
      pendingSaveRef.current = configToSave;
      return;
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      let currentConfig: HooksNotificationsSettings | null = configToSave;
      while (currentConfig) {
        const updated = await configClient.setHooksNotificationsConfig(currentConfig);
        currentConfig = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!currentConfig && updated) setConfig(updated);
      }
    } catch (error) {
      pendingSaveRef.current = null;
      toast({
        title: "Operation failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const addHook = () => {
    if (!config) return;
    const draft: HookCommandItem = {
      id: crypto.randomUUID(),
      name: `Hook ${config.hooks.length + 1}`,
      enabled: false,
      command: "",
      events: [...DEFAULT_IMPORTANT_HOOK_EVENTS],
    };
    const nextConfig = { ...config, hooks: [...config.hooks, draft] };
    setConfig(nextConfig);
    void persistConfig(nextConfig);
  };

  const removeHook = (hookId: string) => {
    if (!config) return;
    const nextConfig = { ...config, hooks: config.hooks.filter((h) => h.id !== hookId) };
    setConfig(nextConfig);
    setTesting((prev) => {
      const next = { ...prev };
      delete next[hookId];
      return next;
    });
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[hookId];
      return next;
    });
    void persistConfig(nextConfig);
  };

  const updateHookEnabled = (hookId: string, enabled: boolean) => {
    if (!config) return;
    const nextConfig = {
      ...config,
      hooks: config.hooks.map((h) => (h.id === hookId ? { ...h, enabled } : h)),
    };
    setConfig(nextConfig);
    void persistConfig(nextConfig);
  };

  const updateHookEvent = (hookId: string, eventName: HookEventName, checked: boolean) => {
    if (!config) return;
    const nextConfig = {
      ...config,
      hooks: config.hooks.map((h) => {
        if (h.id !== hookId) return h;
        const events = new Set(h.events);
        if (checked) events.add(eventName);
        else events.delete(eventName);
        return { ...h, events: Array.from(events) };
      }),
    };
    setConfig(nextConfig);
    void persistConfig(nextConfig);
  };

  const updateHookField = (hookId: string, field: "name" | "command", value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      hooks: config.hooks.map((h) => (h.id === hookId ? { ...h, [field]: value } : h)),
    });
  };

  const runHookTest = async (hookId: string) => {
    if (testing[hookId]) return;
    setTesting((prev) => ({ ...prev, [hookId]: true }));
    setTestResults((prev) => ({ ...prev, [hookId]: null }));
    try {
      await persistConfig();
      const result = await configClient.testHookCommand(hookId);
      setTestResults((prev) => ({ ...prev, [hookId]: result }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [hookId]: {
          success: false,
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [hookId]: false }));
    }
  };

  const formatPreview = (value?: string) => {
    if (!value) return "";
    return value.length <= PREVIEW_LIMIT ? value : `${value.slice(0, PREVIEW_LIMIT)}…`;
  };

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const result = await configClient.getHooksNotificationsConfig();
        if (active) setConfig(result);
      } catch (error) {
        if (active) {
          toast({
            title: "Operation failed",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadConfig();
    return () => {
      active = false;
    };
  }, [toast]);

  if (isLoading) {
    return (
      <ScrollArea data-testid="settings-notifications-hooks-page" className="h-full w-full">
        <div className="flex h-full w-full flex-col gap-4 p-4">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </ScrollArea>
    );
  }

  if (!config) {
    return (
      <ScrollArea data-testid="settings-notifications-hooks-page" className="h-full w-full">
        <div className="flex h-full w-full flex-col gap-4 p-4">
          <div className="text-sm text-muted-foreground">Request failed</div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea data-testid="settings-notifications-hooks-page" className="h-full w-full">
      <div className="flex h-full w-full flex-col gap-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-base font-medium">Notification Hooks</div>
            {isSaving && <span className="text-xs text-muted-foreground">Saving</span>}
          </div>
          <div className="text-sm text-muted-foreground">Configure shell commands that run on specific events.</div>
          <div className="text-xs text-muted-foreground">Use placeholders in commands to receive event data.</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button data-testid="notifications-hooks-add" variant="outline" size="sm" onClick={addHook}>
                <Icon icon="lucide:plus" className="mr-1 h-4 w-4" />
                New Hook
              </Button>
            </div>

            <Collapsible open={guideOpen} onOpenChange={setGuideOpen} className="rounded-md border bg-muted/20">
              <CollapsibleTrigger
                render={<Button variant="ghost" className="flex h-auto w-full items-center justify-between p-4" />}
              >
                <div className="min-w-0 text-left">
                  <div className="text-sm font-medium">Command Guide</div>
                  <p className="mt-1 text-xs text-muted-foreground">Learn how to configure hook commands</p>
                </div>
                <Icon
                  icon={guideOpen ? "lucide:chevron-up" : "lucide:chevron-down"}
                  className="ml-3 h-4 w-4 shrink-0 text-muted-foreground"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t px-4 pb-4">
                <div className="space-y-4 pt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Delivery</div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>JSON payload via stdin</li>
                        <li>Placeholders in command string</li>
                        <li>Environment variables</li>
                        <li>Metadata only (no content)</li>
                      </ul>
                      <div className="rounded-md border bg-background p-3">
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground">Stdin Preview</div>
                        <pre className="whitespace-pre-wrap break-all text-[11px] leading-5">{stdinPreview}</pre>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Placeholders</div>
                      <p className="text-xs text-muted-foreground">Use these tokens in your command string.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {placeholderDocs.map((item) => (
                          <div key={item.token} className="rounded-md border bg-background p-3">
                            <div className="text-xs font-medium">
                              <code>{item.token}</code>
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {fieldDescriptions[item.field]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Environment Variables</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {envDocs.map((item) => (
                          <div key={item.token} className="rounded-md border bg-background p-3">
                            <div className="text-xs font-medium">
                              <code>{item.token}</code>
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {fieldDescriptions[item.field]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Examples</div>
                      <div className="space-y-2">
                        {commandExamples.map((item) => (
                          <div key={item.label} className="rounded-md border bg-background p-3">
                            <div className="mb-2 text-[11px] font-medium text-muted-foreground">{item.label}</div>
                            <pre className="whitespace-pre-wrap break-all text-[11px] leading-5">{item.command}</pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {config.hooks.length === 0 ? (
              <div
                data-testid="notifications-hooks-empty"
                className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
              >
                No hooks configured. Click &quot;New Hook&quot; to add one.
              </div>
            ) : (
              <div className="space-y-3">
                {config.hooks.map((hook, index) => (
                  <div key={hook.id} data-testid={`notifications-hook-${hook.id}`} className="rounded-md border p-4">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-[180px]">
                          <div className="text-sm font-medium">{hook.name || `Hook ${index + 1}`}</div>
                          <div className="text-xs text-muted-foreground">{hook.id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{hook.enabled ? "Enabled" : "Disabled"}</span>
                            <Switch
                              checked={hook.enabled}
                              onCheckedChange={(value) => updateHookEnabled(hook.id, value)}
                            />
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={testing[hook.id] || !hook.command.trim()}
                            onClick={() => void runHookTest(hook.id)}
                          >
                            <Icon
                              icon={testing[hook.id] ? "lucide:loader-2" : "lucide:play"}
                              className={`mr-1 h-4 w-4 ${testing[hook.id] ? "animate-spin" : ""}`}
                            />
                            {testing[hook.id] ? "Testing..." : "Test"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeHook(hook.id)}
                          >
                            <Icon icon="lucide:trash-2" className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Name</Label>
                          <Input
                            value={hook.name}
                            placeholder="Hook name"
                            onChange={(e) => updateHookField(hook.id, "name", e.target.value)}
                            onBlur={() => void persistConfig()}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Command</Label>
                          <Input
                            value={hook.command}
                            placeholder="Command to execute"
                            onChange={(e) => updateHookField(hook.id, "command", e.target.value)}
                            onBlur={() => void persistConfig()}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Events</Label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {HOOK_EVENT_NAMES.map((eventName) => (
                            <label key={`${hook.id}-${eventName}`} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={hook.events.includes(eventName)}
                                onCheckedChange={(value) => updateHookEvent(hook.id, eventName, value === true)}
                              />
                              <span>{eventLabels[eventName] ?? eventName}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {testResults[hook.id] && (
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={testResults[hook.id]?.success ? "text-emerald-600" : "text-destructive"}>
                              {testResults[hook.id]?.success ? "Success" : "Failed"}
                            </span>
                            <span className="text-muted-foreground">{testResults[hook.id]?.durationMs ?? 0}ms</span>
                            {testResults[hook.id]?.exitCode !== undefined && (
                              <span className="text-muted-foreground">Exit code: {testResults[hook.id]?.exitCode}</span>
                            )}
                          </div>
                          {testResults[hook.id]?.error && (
                            <div className="break-all text-destructive">{testResults[hook.id]?.error}</div>
                          )}
                          {testResults[hook.id]?.stdout && (
                            <div className="break-all text-muted-foreground">
                              <span className="font-medium">stdout</span>: {formatPreview(testResults[hook.id]?.stdout)}
                            </div>
                          )}
                          {testResults[hook.id]?.stderr && (
                            <div className="break-all text-muted-foreground">
                              <span className="font-medium">stderr</span>: {formatPreview(testResults[hook.id]?.stderr)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
