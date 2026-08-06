import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shadcn/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Switch } from "#shadcn/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { useToast } from "#/components/use-toast";
import ModelSelect from "#/components/ModelSelect";
import ModelIcon from "#/components/icons/ModelIcon";
import { useModelStore } from "#/stores/modelStore";
import { createConfigClient } from "#api/ConfigClient";
import { createScheduledTasksClient } from "#api/ScheduledTasksClient";
import SettingsPageShell from "./control-center/SettingsPageShell";
import type {
  ScheduledTask,
  ScheduledTaskAction,
  ScheduledTaskTrigger,
  ScheduledTasksSettings,
} from "@argos/shared/scheduledTasks";
import type { Agent } from "@argos/shared/types/agent-interface";
import type { RENDERER_MODEL_META } from "@argos/shared/presenter";

type TriggerKind = ScheduledTaskTrigger["kind"];
type ActionKind = ScheduledTaskAction["kind"];
type NotifyAction = Extract<ScheduledTaskAction, { kind: "notify" }>;
type PromptAction = Extract<ScheduledTaskAction, { kind: "prompt" }>;

const DAY_OF_WEEK_OPTIONS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const padTwo = (value: number) => value.toString().padStart(2, "0");

const formatDateTimeLocal = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}T${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
};

export default function ScheduledTasksSettings() {
  const { toast } = useToast();
  const client = useMemo(() => createScheduledTasksClient(), []);
  const configClient = useMemo(() => createConfigClient(), []);
  const modelStore = useModelStore();

  const [settings, setSettings] = useState<ScheduledTasksSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [firingId, setFiringId] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState<Record<string, boolean>>({});
  const [openTaskIds, setOpenTaskIds] = useState<string[]>([]);
  const [onceInputValues, setOnceInputValues] = useState<string[]>([]);
  const [recurringTimeValues, setRecurringTimeValues] = useState<string[]>([]);

  const tasks = useMemo(() => settings?.tasks ?? [], [settings]);
  const enabledAgents = useMemo(() => agents.filter((a) => a.enabled), [agents]);

  const getModelLabel = useCallback(
    (action: PromptAction): string => {
      if (!action.modelId) return "Select model";
      const provider = modelStore.enabledModels.find((e) => e.providerId === action.providerId);
      const model = provider?.models.find((e) => e.id === action.modelId);
      return model?.name ?? action.modelId;
    },
    [modelStore.enabledModels],
  );

  const getTriggerSummary = useCallback((trigger: ScheduledTaskTrigger): string => {
    switch (trigger.kind) {
      case "once":
        return `Once at ${new Date(trigger.firesAt).toLocaleString()}`;
      case "daily":
        return `Daily at ${padTwo(trigger.hour)}:${padTwo(trigger.minute)}`;
      case "weekly":
        return `Weekly on ${DAY_OF_WEEK_OPTIONS[trigger.dayOfWeek]} at ${padTwo(trigger.hour)}:${padTwo(trigger.minute)}`;
    }
  }, []);

  const refreshFormBuffers = useCallback(() => {
    setOnceInputValues(tasks.map((t) => (t.trigger.kind === "once" ? formatDateTimeLocal(t.trigger.firesAt) : "")));
    setRecurringTimeValues(
      tasks.map((t) => {
        if (t.trigger.kind === "daily" || t.trigger.kind === "weekly")
          return `${padTwo(t.trigger.hour)}:${padTwo(t.trigger.minute)}`;
        return "09:00";
      }),
    );
  }, [tasks]);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextSettings, nextAgents] = await Promise.all([client.list(), configClient.listAgents()]);
      setSettings(nextSettings);
      setAgents(nextAgents);
    } catch (error) {
      toast({
        title: "Operation failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [client, configClient, toast]);

  const persistTask = useCallback(
    async (task: ScheduledTask) => {
      setIsSaving(true);
      try {
        const response = await client.upsert({
          id: task.id,
          name: task.name,
          enabled: task.enabled,
          trigger: structuredClone(task.trigger),
          action: structuredClone(task.action),
        });
        setSettings(response.settings);
      } catch (error) {
        toast({
          title: "Operation failed",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [client, toast],
  );

  const commitTask = useCallback(
    async (index: number) => {
      const task = tasks[index];
      if (!task) return;
      await persistTask(task);
    },
    [tasks, persistTask],
  );

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    refreshFormBuffers();
  }, [tasks, refreshFormBuffers]);

  return (
    <SettingsPageShell
      data-testid="settings-scheduled-tasks-page"
      title="Scheduled Tasks"
      eyebrow="Tools"
      description="Automate tasks with scheduled prompts and notifications"
      actions={
        settings && !isLoading ? (
          <>
            {isSaving && (
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">Saving</span>
            )}
            <Button
              data-testid="scheduled-tasks-add"
              size="sm"
              onClick={async () => {
                setIsSaving(true);
                try {
                  const response = await client.upsert({
                    name: "New Task",
                    enabled: false,
                    trigger: { kind: "daily", hour: 9, minute: 0 },
                    action: { kind: "notify", title: "Notification", body: "" },
                  });
                  setSettings(response.settings);
                  if (response.task) setOpenTaskIds((prev) => [...prev, response.task!.id]);
                } catch (error) {
                  toast({ title: "Operation failed", variant: "destructive" });
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              <Icon icon="lucide:plus" className="mr-1 h-4 w-4" />
              New Task
            </Button>
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !settings ? (
        <div className="text-sm text-muted-foreground">Request failed</div>
      ) : (
        <>
          <p className="-mt-1 text-xs leading-5 text-muted-foreground">
            Tasks run automatically at the scheduled time.
          </p>

          {settings.tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon icon="lucide:clock-9" className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No scheduled tasks</div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  const response = await client.upsert({
                    name: "New Task",
                    enabled: false,
                    trigger: { kind: "daily", hour: 9, minute: 0 },
                    action: { kind: "notify", title: "Notification", body: "" },
                  });
                  setSettings(response.settings);
                }}
              >
                <Icon icon="lucide:plus" className="mr-1 h-4 w-4" />
                New Task
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border bg-card/30">
                {settings.tasks.map((task, index) => (
                  <Collapsible
                    key={task.id}
                    open={openTaskIds.includes(task.id)}
                    onOpenChange={(open) => {
                      setOpenTaskIds((prev) => (open ? [...prev, task.id] : prev.filter((id) => id !== task.id)));
                    }}
                  >
                    <div
                      className={`border-b last:border-b-0 transition-colors ${openTaskIds.includes(task.id) ? "bg-muted/30" : "hover:bg-muted/20"}`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
                        <CollapsibleTrigger
                          render={
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
                            />
                          }
                        >
                          <Icon
                            icon="lucide:chevron-right"
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${openTaskIds.includes(task.id) ? "rotate-90" : ""}`}
                          />
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium">{task.name || "New Task"}</div>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${task.action.kind === "prompt" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                              >
                                {task.action.kind === "prompt" ? "Prompt" : "Notify"}
                              </span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {getTriggerSummary(task.trigger)}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <div className="flex shrink-0 items-center gap-1">
                          <Switch
                            checked={task.enabled}
                            aria-label={task.enabled ? "Enabled" : "Disabled"}
                            onCheckedChange={async (value) => {
                              try {
                                const response = await client.toggle(task.id, value);
                                setSettings(response.settings);
                              } catch (error) {
                                toast({ title: "Operation failed", variant: "destructive" });
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={firingId === task.id}
                            title="Run now"
                            onClick={async () => {
                              setFiringId(task.id);
                              try {
                                const response = await client.fireNow(task.id);
                                setSettings(response.settings);
                                toast({ title: "Task executed", description: response.task.name });
                              } catch (error) {
                                toast({ title: "Operation failed", variant: "destructive" });
                              } finally {
                                setFiringId(null);
                              }
                            }}
                          >
                            <Icon
                              icon={firingId === task.id ? "lucide:loader-2" : "lucide:play"}
                              className={`h-4 w-4 ${firingId === task.id ? "animate-spin text-muted-foreground" : ""}`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Delete"
                            title="Delete"
                            onClick={async () => {
                              try {
                                const response = await client.remove(task.id);
                                setSettings(response);
                              } catch (error) {
                                toast({ title: "Operation failed", variant: "destructive" });
                              }
                            }}
                          >
                            <Icon icon="lucide:trash-2" className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="border-t bg-background/60 px-4 py-4 sm:px-5 sm:py-5">
                          <div className="mb-4 space-y-2">
                            <Label className="text-xs text-muted-foreground">Task Name</Label>
                            <Input
                              value={task.name}
                              placeholder="Task name"
                              className="h-8!"
                              onChange={(e) => {
                                const next: ScheduledTasksSettings = {
                                  ...settings!,
                                  tasks: settings.tasks.map((t, i) =>
                                    i === index ? { ...t, name: e.target.value } : t,
                                  ),
                                };
                                setSettings(next);
                              }}
                              onBlur={() => void commitTask(index)}
                            />
                          </div>

                          <div className="grid items-start gap-4 lg:grid-cols-2">
                            <section className="space-y-3 rounded-lg border bg-card/40 p-4">
                              <div className="flex items-center gap-2">
                                <Icon icon="lucide:calendar-clock" className="h-4 w-4 text-muted-foreground" />
                                <div className="text-sm font-medium">Trigger</div>
                              </div>
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Type</Label>
                                  <Select
                                    value={task.trigger.kind}
                                    onValueChange={(value) => {
                                      let trigger: ScheduledTaskTrigger;
                                      switch (value as TriggerKind) {
                                        case "once":
                                          trigger = { kind: "once", firesAt: Date.now() + 3600000 };
                                          break;
                                        case "daily":
                                          trigger = { kind: "daily", hour: 9, minute: 0 };
                                          break;
                                        case "weekly":
                                          trigger = {
                                            kind: "weekly",
                                            dayOfWeek: 1,
                                            hour: 9,
                                            minute: 0,
                                          };
                                          break;
                                      }
                                      const next: ScheduledTasksSettings = {
                                        ...settings!,
                                        tasks: settings.tasks.map((t, i) => (i === index ? { ...t, trigger } : t)),
                                      };
                                      setSettings(next);
                                      void commitTask(index);
                                    }}
                                  >
                                    <SelectTrigger className="h-8! w-full min-w-0">
                                      <SelectValue className="min-w-0 truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="once">Once</SelectItem>
                                      <SelectItem value="daily">Daily</SelectItem>
                                      <SelectItem value="weekly">Weekly</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {task.trigger.kind === "once" && (
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Fires At</Label>
                                    <Input
                                      type="datetime-local"
                                      className="h-8!"
                                      value={onceInputValues[index] ?? ""}
                                      onChange={(e) => {
                                        const ts = new Date(e.target.value).getTime();
                                        if (Number.isFinite(ts)) {
                                          const next: ScheduledTasksSettings = {
                                            ...settings!,
                                            tasks: settings.tasks.map((t, i) =>
                                              i === index
                                                ? { ...t, trigger: { kind: "once" as const, firesAt: ts } }
                                                : t,
                                            ),
                                          };
                                          setSettings(next);
                                        }
                                      }}
                                      onBlur={() => void commitTask(index)}
                                    />
                                  </div>
                                )}
                                {(task.trigger.kind === "daily" || task.trigger.kind === "weekly") && (
                                  <>
                                    {task.trigger.kind === "weekly" && (
                                      <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Day of Week</Label>
                                        <Select
                                          value={String(task.trigger.dayOfWeek)}
                                          onValueChange={(value) => {
                                            const next: ScheduledTasksSettings = {
                                              ...settings!,
                                              tasks: settings.tasks.map((t, i) =>
                                                i === index && t.trigger.kind === "weekly"
                                                  ? {
                                                      ...t,
                                                      trigger: {
                                                        ...t.trigger,
                                                        dayOfWeek: Number(value),
                                                      },
                                                    }
                                                  : t,
                                              ),
                                            };
                                            setSettings(next);
                                            void commitTask(index);
                                          }}
                                        >
                                          <SelectTrigger className="h-8! w-full min-w-0">
                                            <SelectValue className="min-w-0 truncate" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {Object.entries(DAY_OF_WEEK_OPTIONS).map(([value, label]) => (
                                              <SelectItem key={value} value={value}>
                                                {label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                    <div className="space-y-1.5">
                                      <Label className="text-xs text-muted-foreground">Time</Label>
                                      <Input
                                        type="time"
                                        className="h-8!"
                                        value={recurringTimeValues[index] ?? "09:00"}
                                        onChange={(e) => {
                                          const [h, m] = e.target.value.split(":");
                                          const hour = Number(h);
                                          const minute = Number(m);
                                          if (Number.isFinite(hour) && Number.isFinite(minute)) {
                                            const next: ScheduledTasksSettings = {
                                              ...settings!,
                                              tasks: settings.tasks.map((t, i) => {
                                                if (i !== index) return t;
                                                if (t.trigger.kind === "daily")
                                                  return {
                                                    ...t,
                                                    trigger: { kind: "daily" as const, hour, minute },
                                                  };
                                                if (t.trigger.kind === "weekly")
                                                  return {
                                                    ...t,
                                                    trigger: { ...t.trigger, hour, minute },
                                                  };
                                                return t;
                                              }),
                                            };
                                            setSettings(next);
                                          }
                                        }}
                                        onBlur={() => void commitTask(index)}
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </section>

                            <section className="space-y-3 rounded-lg border bg-card/40 p-4">
                              <div className="flex items-center gap-2">
                                <Icon icon="lucide:send" className="h-4 w-4 text-muted-foreground" />
                                <div className="text-sm font-medium">Action</div>
                              </div>
                              <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="min-w-0 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Type</Label>
                                    <Select
                                      value={task.action.kind}
                                      onValueChange={(value) => {
                                        const kind = value as ActionKind;
                                        let action: ScheduledTaskAction;
                                        if (kind === "notify") {
                                          action = {
                                            kind: "notify",
                                            title: task.action.title || task.name,
                                            body: "",
                                          };
                                        } else {
                                          action = {
                                            kind: "prompt",
                                            title: task.action.title || task.name,
                                            message: "",
                                            autoSend: false,
                                            agentId: "argos",
                                          };
                                        }
                                        const next: ScheduledTasksSettings = {
                                          ...settings!,
                                          tasks: settings.tasks.map((t, i) => (i === index ? { ...t, action } : t)),
                                        };
                                        setSettings(next);
                                        void commitTask(index);
                                      }}
                                    >
                                      <SelectTrigger className="h-8! w-full min-w-0">
                                        <SelectValue className="min-w-0 truncate" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="notify">Notify</SelectItem>
                                        <SelectItem value="prompt">Prompt</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="min-w-0 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Title</Label>
                                    <Input
                                      value={task.action.title}
                                      className="h-8!"
                                      placeholder="Title"
                                      onChange={(e) => {
                                        const next: ScheduledTasksSettings = {
                                          ...settings!,
                                          tasks: settings.tasks.map((t, i) =>
                                            i === index
                                              ? {
                                                  ...t,
                                                  action: { ...t.action, title: e.target.value },
                                                }
                                              : t,
                                          ),
                                        };
                                        setSettings(next);
                                      }}
                                      onBlur={() => void commitTask(index)}
                                    />
                                  </div>
                                </div>

                                {task.action.kind === "notify" && (
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Body</Label>
                                    <textarea
                                      value={(task.action as NotifyAction).body}
                                      className="min-h-20 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      rows={3}
                                      onChange={(e) => {
                                        const next: ScheduledTasksSettings = {
                                          ...settings!,
                                          tasks: settings.tasks.map((t, i) =>
                                            i === index
                                              ? {
                                                  ...t,
                                                  action: { ...t.action, body: e.target.value },
                                                }
                                              : t,
                                          ),
                                        };
                                        setSettings(next);
                                      }}
                                      onBlur={() => void commitTask(index)}
                                    />
                                  </div>
                                )}

                                {task.action.kind === "prompt" && (
                                  <>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs text-muted-foreground">Message</Label>
                                      <textarea
                                        value={(task.action as PromptAction).message}
                                        className="min-h-24 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        rows={3}
                                        onChange={(e) => {
                                          const next: ScheduledTasksSettings = {
                                            ...settings!,
                                            tasks: settings.tasks.map((t, i) =>
                                              i === index
                                                ? {
                                                    ...t,
                                                    action: { ...t.action, message: e.target.value },
                                                  }
                                                : t,
                                            ),
                                          };
                                          setSettings(next);
                                        }}
                                        onBlur={() => void commitTask(index)}
                                      />
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div className="min-w-0 space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Agent</Label>
                                        <Select
                                          value={(task.action as PromptAction).agentId ?? "argos"}
                                          onValueChange={(value) => {
                                            const agent = enabledAgents.find((a) => a.id === value);
                                            const preset = agent?.config?.defaultModelPreset;
                                            const next: ScheduledTasksSettings = {
                                              ...settings!,
                                              tasks: settings.tasks.map((t, i) =>
                                                i === index
                                                  ? ({
                                                      ...t,
                                                      action: {
                                                        ...t.action,
                                                        agentId: value,
                                                        ...(preset
                                                          ? {
                                                              providerId: preset.providerId,
                                                              modelId: preset.modelId,
                                                            }
                                                          : {}),
                                                      },
                                                    } as ScheduledTask)
                                                  : t,
                                              ),
                                            };
                                            setSettings(next);
                                            void commitTask(index);
                                          }}
                                        >
                                          <SelectTrigger className="h-8! w-full min-w-0">
                                            <SelectValue className="min-w-0 truncate" placeholder="Select agent" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {enabledAgents.map((agent) => (
                                              <SelectItem key={agent.id} value={agent.id}>
                                                <span className="block max-w-[18rem] truncate">
                                                  {agent.name} ({agent.id})
                                                </span>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="min-w-0 space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Model</Label>
                                        <Popover
                                          open={modelPickerOpen[task.id] ?? false}
                                          onOpenChange={(open) =>
                                            setModelPickerOpen((prev) => ({
                                              ...prev,
                                              [task.id]: open,
                                            }))
                                          }
                                        >
                                          <PopoverTrigger
                                            render={
                                              <Button
                                                type="button"
                                                variant="outline"
                                                className="h-8! w-full min-w-0 justify-between px-3 text-left font-normal"
                                              />
                                            }
                                          >
                                            <span className="flex min-w-0 items-center gap-2">
                                              {(task.action as PromptAction).providerId && (
                                                <ModelIcon modelId={(task.action as PromptAction).providerId ?? ""} />
                                              )}
                                              <span className="truncate">
                                                {getModelLabel(task.action as PromptAction)}
                                              </span>
                                            </span>
                                            <Icon icon="lucide:chevron-down" className="h-4 w-4 shrink-0 opacity-50" />
                                          </PopoverTrigger>
                                          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
                                            <ModelSelect
                                              excludeProviders={["acp"]}
                                              respectChatMode={false}
                                              selectedProviderId={(task.action as PromptAction).providerId ?? ""}
                                              selectedModelId={(task.action as PromptAction).modelId ?? ""}
                                              onUpdateModel={(model: RENDERER_MODEL_META, providerId: string) => {
                                                const next: ScheduledTasksSettings = {
                                                  ...settings!,
                                                  tasks: settings.tasks.map((t, i) =>
                                                    i === index
                                                      ? {
                                                          ...t,
                                                          action: {
                                                            ...t.action,
                                                            providerId,
                                                            modelId: model.id,
                                                          },
                                                        }
                                                      : t,
                                                  ),
                                                };
                                                setSettings(next);
                                                setModelPickerOpen((prev) => ({
                                                  ...prev,
                                                  [task.id]: false,
                                                }));
                                                void commitTask(index);
                                              }}
                                            />
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs text-muted-foreground">System Prompt</Label>
                                      <textarea
                                        value={(task.action as PromptAction).systemPrompt ?? ""}
                                        className="min-h-20 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        rows={2}
                                        onChange={(e) => {
                                          const next: ScheduledTasksSettings = {
                                            ...settings!,
                                            tasks: settings.tasks.map((t, i) =>
                                              i === index
                                                ? {
                                                    ...t,
                                                    action: {
                                                      ...t.action,
                                                      systemPrompt: e.target.value,
                                                    },
                                                  }
                                                : t,
                                            ),
                                          };
                                          setSettings(next);
                                        }}
                                        onBlur={() => void commitTask(index)}
                                      />
                                    </div>
                                    <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={(task.action as PromptAction).autoSend}
                                        onChange={(e) => {
                                          const next: ScheduledTasksSettings = {
                                            ...settings!,
                                            tasks: settings.tasks.map((t, i) =>
                                              i === index
                                                ? {
                                                    ...t,
                                                    action: {
                                                      ...t.action,
                                                      autoSend: e.target.checked,
                                                    },
                                                  }
                                                : t,
                                            ),
                                          };
                                          setSettings(next);
                                        }}
                                        onBlur={() => void commitTask(index)}
                                      />
                                      Auto-send
                                    </label>
                                  </>
                                )}
                              </div>
                            </section>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SettingsPageShell>
  );
}
