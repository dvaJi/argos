import { useState, useEffect, useRef } from "react";
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
// Process-wide singleton; module scope keeps effect dependencies stable.
const client = createScheduledTasksClient();
const configClient = createConfigClient();

type TriggerKind = ScheduledTaskTrigger["kind"];
type ActionKind = ScheduledTaskAction["kind"];
type NotifyAction = Extract<
  ScheduledTaskAction,
  {
    kind: "notify";
  }
>;
type PromptAction = Extract<
  ScheduledTaskAction,
  {
    kind: "prompt";
  }
>;
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
const getTriggerSummary = (trigger: ScheduledTaskTrigger): string => {
  switch (trigger.kind) {
    case "once":
      return `Once at ${new Date(trigger.firesAt).toLocaleString()}`;
    case "daily":
      return `Daily at ${padTwo(trigger.hour)}:${padTwo(trigger.minute)}`;
    case "weekly":
      return `Weekly on ${DAY_OF_WEEK_OPTIONS[trigger.dayOfWeek]} at ${padTwo(trigger.hour)}:${padTwo(trigger.minute)}`;
  }
};
const newTaskPayload = () => ({
  name: "New Task",
  enabled: false,
  trigger: {
    kind: "daily" as const,
    hour: 9,
    minute: 0,
  },
  action: {
    kind: "notify" as const,
    title: "Notification",
    body: "",
  },
});
const updateTaskField = (
  settings: ScheduledTasksSettings,
  index: number,
  updater: (task: ScheduledTask) => ScheduledTask,
): ScheduledTasksSettings => ({
  ...settings,
  tasks: settings.tasks.map((t, i) => (i === index ? updater(t) : t)),
});
interface TaskTriggerSectionProps {
  task: ScheduledTask;
  index: number;
  settings: ScheduledTasksSettings;
  onceInputValues: string[];
  recurringTimeValues: string[];
  setSettings: (next: ScheduledTasksSettings) => void;
  commitTask: (index: number, override?: ScheduledTask) => Promise<void>;
}

/** Trigger fields (type, fires-at, day/time) for a single scheduled task. */
function TaskTriggerSection({
  task,
  index,
  settings,
  onceInputValues,
  recurringTimeValues,
  setSettings,
  commitTask,
}: TaskTriggerSectionProps) {
  return (
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
                  trigger = {
                    kind: "once",
                    firesAt: Date.now() + 3600000,
                  };
                  break;
                case "daily":
                  trigger = {
                    kind: "daily",
                    hour: 9,
                    minute: 0,
                  };
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
              const next = updateTaskField(settings, index, (t) => ({ ...t, trigger }));
              setSettings(next);
              void commitTask(index, next.tasks[index]);
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
                  const next = updateTaskField(settings, index, (t) => ({
                    ...t,
                    trigger: {
                      kind: "once" as const,
                      firesAt: ts,
                    },
                  }));
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
                    const next = updateTaskField(settings, index, (t) =>
                      t.trigger.kind === "weekly"
                        ? {
                            ...t,
                            trigger: {
                              ...t.trigger,
                              dayOfWeek: Number(value),
                            },
                          }
                        : t,
                    );
                    setSettings(next);
                    void commitTask(index, next.tasks[index]);
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
                    const next = updateTaskField(settings, index, (t) => {
                      if (t.trigger.kind === "daily")
                        return {
                          ...t,
                          trigger: {
                            kind: "daily" as const,
                            hour,
                            minute,
                          },
                        };
                      if (t.trigger.kind === "weekly")
                        return {
                          ...t,
                          trigger: {
                            ...t.trigger,
                            hour,
                            minute,
                          },
                        };
                      return t;
                    });
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
  );
}
interface PromptActionFieldsProps {
  task: ScheduledTask;
  index: number;
  settings: ScheduledTasksSettings;
  enabledAgents: Agent[];
  modelPickerOpen: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
  getModelLabel: (action: PromptAction) => string;
  setSettings: (next: ScheduledTasksSettings) => void;
  commitTask: (index: number, override?: ScheduledTask) => Promise<void>;
}

/** Message/agent/model/system-prompt/auto-send fields for prompt actions. */
function PromptActionFields({
  task,
  index,
  settings,
  enabledAgents,
  modelPickerOpen,
  onModelPickerOpenChange,
  getModelLabel,
  setSettings,
  commitTask,
}: PromptActionFieldsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`task-prompt-message-${task.id}`} className="text-xs text-muted-foreground">
          Message
        </Label>
        <textarea
          id={`task-prompt-message-${task.id}`}
          value={(task.action as PromptAction).message}
          className="min-h-24 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3}
          onChange={(e) => {
            const next = updateTaskField(settings, index, (t) => ({
              ...t,
              action: {
                ...t.action,
                message: e.target.value,
              },
            }));
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
              const next = updateTaskField(
                settings,
                index,
                (t) =>
                  ({
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
                  }) as ScheduledTask,
              );
              setSettings(next);
              void commitTask(index, next.tasks[index]);
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
          <Popover open={modelPickerOpen} onOpenChange={onModelPickerOpenChange}>
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
                <span className="truncate">{getModelLabel(task.action as PromptAction)}</span>
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
                  const next = updateTaskField(settings, index, (t) => ({
                    ...t,
                    action: {
                      ...t.action,
                      providerId,
                      modelId: model.id,
                    },
                  }));
                  setSettings(next);
                  onModelPickerOpenChange(false);
                  void commitTask(index, next.tasks[index]);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`task-system-prompt-${task.id}`} className="text-xs text-muted-foreground">
          System Prompt
        </Label>
        <textarea
          id={`task-system-prompt-${task.id}`}
          value={(task.action as PromptAction).systemPrompt ?? ""}
          className="min-h-20 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={2}
          onChange={(e) => {
            const next = updateTaskField(settings, index, (t) => ({
              ...t,
              action: {
                ...t.action,
                systemPrompt: e.target.value,
              },
            }));
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
            const next = updateTaskField(settings, index, (t) => ({
              ...t,
              action: {
                ...t.action,
                autoSend: e.target.checked,
              },
            }));
            setSettings(next);
          }}
          onBlur={() => void commitTask(index)}
        />
        Auto-send
      </label>
    </>
  );
}
interface TaskActionSectionProps {
  task: ScheduledTask;
  index: number;
  settings: ScheduledTasksSettings;
  enabledAgents: Agent[];
  modelPickerOpen: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
  getModelLabel: (action: PromptAction) => string;
  setSettings: (next: ScheduledTasksSettings) => void;
  commitTask: (index: number, override?: ScheduledTask) => Promise<void>;
}

/** Action fields (type, title, body/message) for a single scheduled task. */
function TaskActionSection({
  task,
  index,
  settings,
  enabledAgents,
  modelPickerOpen,
  onModelPickerOpenChange,
  getModelLabel,
  setSettings,
  commitTask,
}: TaskActionSectionProps) {
  return (
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
                const next = updateTaskField(settings, index, (t) => ({ ...t, action }));
                setSettings(next);
                void commitTask(index, next.tasks[index]);
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
                const next = updateTaskField(settings, index, (t) => ({
                  ...t,
                  action: {
                    ...t.action,
                    title: e.target.value,
                  },
                }));
                setSettings(next);
              }}
              onBlur={() => void commitTask(index)}
            />
          </div>
        </div>

        {task.action.kind === "notify" && (
          <div className="space-y-1.5">
            <Label htmlFor={`task-notify-body-${task.id}`} className="text-xs text-muted-foreground">
              Body
            </Label>
            <textarea
              id={`task-notify-body-${task.id}`}
              value={(task.action as NotifyAction).body}
              className="min-h-20 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
              onChange={(e) => {
                const next = updateTaskField(settings, index, (t) => ({
                  ...t,
                  action: {
                    ...t.action,
                    body: e.target.value,
                  },
                }));
                setSettings(next);
              }}
              onBlur={() => void commitTask(index)}
            />
          </div>
        )}

        {task.action.kind === "prompt" && (
          <PromptActionFields
            task={task}
            index={index}
            settings={settings}
            enabledAgents={enabledAgents}
            modelPickerOpen={modelPickerOpen}
            onModelPickerOpenChange={onModelPickerOpenChange}
            getModelLabel={getModelLabel}
            setSettings={setSettings}
            commitTask={commitTask}
          />
        )}
      </div>
    </section>
  );
}
interface TaskEditorPanelProps {
  task: ScheduledTask;
  index: number;
  settings: ScheduledTasksSettings;
  enabledAgents: Agent[];
  onceInputValues: string[];
  recurringTimeValues: string[];
  /** Whether the model picker popover is open for this task. */
  modelPickerOpen: boolean;
  onModelPickerOpenChange: (open: boolean) => void;
  getModelLabel: (action: PromptAction) => string;
  setSettings: (next: ScheduledTasksSettings) => void;
  commitTask: (index: number, override?: ScheduledTask) => Promise<void>;
}

/**
 * Expanded editor for a single scheduled task: name, trigger, and action
 * fields. Extracted from `ScheduledTasksSettings` to keep JSX nesting shallow.
 */
function TaskEditorPanel({
  task,
  index,
  settings,
  enabledAgents,
  onceInputValues,
  recurringTimeValues,
  modelPickerOpen,
  onModelPickerOpenChange,
  getModelLabel,
  setSettings,
  commitTask,
}: TaskEditorPanelProps) {
  return (
    <div className="border-t bg-background/60 px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-4 space-y-2">
        <Label className="text-xs text-muted-foreground">Task Name</Label>
        <Input
          value={task.name}
          placeholder="Task name"
          className="h-8!"
          onChange={(e) => {
            const next = updateTaskField(settings, index, (t) => ({ ...t, name: e.target.value }));
            setSettings(next);
          }}
          onBlur={() => void commitTask(index)}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TaskTriggerSection
          task={task}
          index={index}
          settings={settings}
          onceInputValues={onceInputValues}
          recurringTimeValues={recurringTimeValues}
          setSettings={setSettings}
          commitTask={commitTask}
        />

        <TaskActionSection
          task={task}
          index={index}
          settings={settings}
          enabledAgents={enabledAgents}
          modelPickerOpen={modelPickerOpen}
          onModelPickerOpenChange={onModelPickerOpenChange}
          getModelLabel={getModelLabel}
          setSettings={setSettings}
          commitTask={commitTask}
        />
      </div>
    </div>
  );
}
interface TaskListItemProps {
  task: ScheduledTask;
  index: number;
  open: boolean;
  firing: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (enabled: boolean) => void;
  onRunNow: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

/** Collapsed summary row (toggle / run / delete) for a scheduled task. */
function TaskListItem({
  task,
  index,
  open,
  firing,
  onOpenChange,
  onToggle,
  onRunNow,
  onDelete,
  children,
}: TaskListItemProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={`border-b last:border-b-0 transition-colors ${open ? "bg-muted/30" : "hover:bg-muted/20"}`}>
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <CollapsibleTrigger
            render={<button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none" />}
          >
            <Icon
              icon="lucide:chevron-right"
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
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
              <div className="truncate text-xs text-muted-foreground">{getTriggerSummary(task.trigger)}</div>
            </div>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center gap-1">
            <Switch
              checked={task.enabled}
              aria-label={task.enabled ? "Enabled" : "Disabled"}
              onCheckedChange={onToggle}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={firing}
              title="Run now"
              onClick={onRunNow}
            >
              <Icon
                icon={firing ? "lucide:loader-2" : "lucide:play"}
                className={`h-4 w-4 ${firing ? "animate-spin text-muted-foreground" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Delete"
              title="Delete"
              onClick={onDelete}
            >
              <Icon icon="lucide:trash-2" className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>{children}</CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function ScheduledTasksSettings() {
  const { toast } = useToast();
  const modelStore = useModelStore();
  const [settings, setSettings] = useState<ScheduledTasksSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Counter of in-flight mutations. A single boolean races when two operations
  // (e.g. toggling one task while saving another) overlap — the first to finish
  // would flip the indicator off while the second is still pending.
  const [pendingMutations, setPendingMutations] = useState(0);
  const [firingId, setFiringId] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState<Record<string, boolean>>({});
  const [openTaskIds, setOpenTaskIds] = useState<string[]>([]);
  const [onceInputValues, setOnceInputValues] = useState<string[]>([]);
  const [recurringTimeValues, setRecurringTimeValues] = useState<string[]>([]);
  const tasks = settings?.tasks ?? [];
  const settingsRef = useRef(settings);
  // Single ordered queue for EVERY settings-mutating operation (upsert, toggle,
  // remove, fireNow). Each op chains onto the previous one so complete-settings
  // responses are applied in submission order — an out-of-order response can no
  // longer restore older fields across different tasks or operation types.
  const mutationQueueRef = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const enabledAgents = agents.filter((a) => a.enabled);
  const getModelLabel = (action: PromptAction): string => {
    if (!action.modelId) return "Select model";
    const provider = modelStore.enabledModels.find((e) => e.providerId === action.providerId);
    const model = provider?.models.find((e) => e.id === action.modelId);
    return model?.name ?? action.modelId;
  };

  // Re-derive the form input buffers whenever the task list identity changes
  // (adjusted during render so the React Compiler can track it).
  const [bufferSyncTasks, setBufferSyncTasks] = useState(tasks);
  if (bufferSyncTasks !== tasks) {
    setBufferSyncTasks(tasks);
    setOnceInputValues(tasks.map((t) => (t.trigger.kind === "once" ? formatDateTimeLocal(t.trigger.firesAt) : "")));
    setRecurringTimeValues(
      tasks.map((t) => {
        if (t.trigger.kind === "daily" || t.trigger.kind === "weekly")
          return `${padTwo(t.trigger.hour)}:${padTwo(t.trigger.minute)}`;
        return "09:00";
      }),
    );
  }

  // Run a settings-mutating operation through the single ordered queue. Errors
  // are surfaced via toast and logged with `label`; the pending counter is
  // always balanced via promise chaining (no try/finally, so React Compiler can
  // still optimize this component). Returns fn's result on success.
  const runMutation = <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setPendingMutations((n) => n + 1);
    const previous = mutationQueueRef.current ?? Promise.resolve();
    // A failed previous op must not block this one — swallow its rejection.
    const run = previous
      .catch(() => {})
      .then(fn)
      .then(
        (result) => {
          setPendingMutations((n) => Math.max(0, n - 1));
          return result;
        },
        (error: unknown) => {
          console.error(`[ScheduledTasks] ${label} failed:`, error);
          toast({
            title: "Operation failed",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
          setPendingMutations((n) => Math.max(0, n - 1));
          throw error;
        },
      );
    mutationQueueRef.current = run.catch(() => {});
    return run;
  };
  const persistTask = (task: ScheduledTask) =>
    runMutation(`persist task ${task.id}`, async () => {
      const response = await client.upsert({
        id: task.id,
        name: task.name,
        enabled: task.enabled,
        trigger: structuredClone(task.trigger),
        action: structuredClone(task.action),
      });
      setSettings(response.settings);
    });
  const commitTask = (index: number, override?: ScheduledTask) => {
    const task = override ?? settingsRef.current?.tasks[index];
    if (!task) return Promise.resolve();
    return persistTask(task);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextSettings, nextAgents] = await Promise.all([client.list(), configClient.listAgents()]);
        if (cancelled) return;
        setSettings(nextSettings);
        setAgents(nextAgents);
      } catch (error: unknown) {
        console.error("[ScheduledTasks] Failed to load settings:", error);
        toast({
          title: "Operation failed",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);
  const openTaskIdSet = new Set(openTaskIds);
  return (
    <SettingsPageShell
      data-testid="settings-scheduled-tasks-page"
      title="Scheduled Tasks"
      eyebrow="Tools"
      description="Automate tasks with scheduled prompts and notifications"
      actions={
        settings && !isLoading ? (
          <>
            {pendingMutations > 0 && (
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">Saving</span>
            )}
            <Button
              data-testid="scheduled-tasks-add"
              size="sm"
              onClick={() => {
                void runMutation("create task", async () => {
                  const response = await client.upsert(newTaskPayload());
                  setSettings(response.settings);
                  if (response.task) setOpenTaskIds((prev) => [...prev, response.task!.id]);
                });
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
                onClick={() => {
                  void runMutation("create task", async () => {
                    const response = await client.upsert(newTaskPayload());
                    setSettings(response.settings);
                  });
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
                  <TaskListItem
                    key={task.id}
                    task={task}
                    index={index}
                    open={openTaskIdSet.has(task.id)}
                    firing={firingId === task.id}
                    onOpenChange={(open) => {
                      setOpenTaskIds((prev) => (open ? [...prev, task.id] : prev.filter((id) => id !== task.id)));
                    }}
                    onToggle={(value) => {
                      void runMutation(`toggle task ${task.id}`, async () => {
                        const response = await client.toggle(task.id, value);
                        setSettings(response.settings);
                      });
                    }}
                    onRunNow={() => {
                      setFiringId(task.id);
                      void runMutation(`run task ${task.id}`, async () => {
                        const response = await client.fireNow(task.id);
                        setSettings(response.settings);
                        toast({
                          title: "Task executed",
                          description: response.task.name,
                        });
                      }).finally(() => setFiringId(null));
                    }}
                    onDelete={() => {
                      void runMutation(`delete task ${task.id}`, async () => {
                        const response = await client.remove(task.id);
                        setSettings(response);
                      });
                    }}
                  >
                    <TaskEditorPanel
                      task={task}
                      index={index}
                      settings={settings}
                      enabledAgents={enabledAgents}
                      onceInputValues={onceInputValues}
                      recurringTimeValues={recurringTimeValues}
                      modelPickerOpen={modelPickerOpen[task.id] ?? false}
                      onModelPickerOpenChange={(open) =>
                        setModelPickerOpen((prev) => ({
                          ...prev,
                          [task.id]: open,
                        }))
                      }
                      getModelLabel={getModelLabel}
                      setSettings={setSettings}
                      commitTask={commitTask}
                    />
                  </TaskListItem>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SettingsPageShell>
  );
}
