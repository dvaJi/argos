import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Switch } from "#shadcn/components/ui/switch";
import type { AcpConfigOption } from "@argos/shared/presenter";

interface AcpAdvancedSettingsProps {
  options: AcpConfigOption[];
  readOnly: boolean;
  isOptionSaving: (configId: string) => boolean;
  getOptionDisplayValue: (option: AcpConfigOption) => string;
  onSelectOption: (configId: string, value: string) => void;
  onBooleanOption: (configId: string, value: boolean) => void;
}

const switchId = (optionId: string) => `acp-advanced-option-${optionId}`;

type AcpOptionValueLike = {
  value: string;
  label: string;
  groupId?: string | null;
  groupLabel?: string | null;
};

const resolveAcpOptionGroup = (entry: AcpOptionValueLike): { key: string; label: string } => {
  if (entry.groupId && entry.groupId.trim()) {
    return { key: entry.groupId, label: entry.groupLabel?.trim() ? entry.groupLabel : entry.groupId };
  }

  const valueSlash = entry.value.indexOf("/");
  const labelSlash = entry.label.indexOf("/");
  const labSource = valueSlash > 0 ? entry.value : labelSlash > 0 ? entry.label : "";
  if (labSource) {
    const lab = labSource.slice(0, labSource.indexOf("/"));
    if (lab.trim()) {
      return { key: `__lab__${lab.toLowerCase()}`, label: lab };
    }
  }

  return { key: "__default__", label: "" };
};

const resolveAcpOptionDisplayLabel = (entry: { label: string }): string => {
  const idx = entry.label.indexOf("/");
  if (idx > 0 && entry.label.slice(idx + 1).trim()) {
    return entry.label.slice(idx + 1);
  }
  return entry.label;
};

export default function AcpAdvancedSettings({
  options,
  readOnly,
  isOptionSaving,
  getOptionDisplayValue,
  onSelectOption,
  onBooleanOption,
}: AcpAdvancedSettingsProps) {
  const [open, setOpen] = useState(false);
  const [openSelectId, setOpenSelectId] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="acp-overflow-button h-6 w-6 px-0 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
            title="Advanced settings"
            aria-label="Advanced settings"
          />
        }
      >
        <Icon icon="lucide:settings-2" className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[19rem] overflow-hidden border border-border p-0">
        <div className="border-b border-border px-3 py-3">
          <div className="text-sm font-medium text-foreground">Advanced Settings</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Session configuration for this agent</div>
        </div>
        {options.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No options available</div>
        ) : (
          <div className="max-h-[24rem] divide-y divide-border overflow-y-auto">
            {options.map((option) => {
              const disabled = readOnly || isOptionSaving(option.id);
              const selectEntries = option.type === "select" ? (option.options ?? []) : [];
              const selectGrouped = selectEntries.reduce<Map<string, { label: string; entries: typeof selectEntries }>>(
                (acc, entry) => {
                  const g = resolveAcpOptionGroup(entry);
                  if (!acc.has(g.key)) {
                    acc.set(g.key, { label: g.label, entries: [] });
                  }
                  acc.get(g.key)!.entries.push(entry);
                  return acc;
                },
                new Map(),
              );
              const selectGroupKeys = [...selectGrouped.keys()];
              const hasSelectGroups =
                selectGroupKeys.length > 1 || (selectGroupKeys.length === 1 && selectGroupKeys[0] !== "__default__");
              return (
                <div
                  key={option.id}
                  data-option-id={option.id}
                  className="acp-overflow-option flex items-start justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={option.type === "boolean" ? switchId(option.id) : undefined}
                      className="block truncate text-xs font-medium text-foreground"
                    >
                      {option.label}
                    </label>
                    {option.description ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{option.description}</p>
                    ) : null}
                  </div>

                  {option.type === "select" ? (
                    <Popover
                      open={openSelectId === option.id}
                      onOpenChange={(o) => setOpenSelectId(o ? option.id : null)}
                    >
                      <PopoverTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={disabled}
                            className="h-8 w-[9rem] shrink-0 justify-between text-xs"
                          />
                        }
                      >
                        <span className="truncate">{getOptionDisplayValue(option)}</span>
                        <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={4} className="min-w-[180px] max-w-[280px] p-1.5">
                        <div className="max-h-60 overflow-y-auto">
                          {selectGroupKeys.map((groupKey) => {
                            const group = selectGrouped.get(groupKey)!;
                            return (
                              <div key={groupKey} className={hasSelectGroups ? "mb-1 last:mb-0" : ""}>
                                {hasSelectGroups && group.label && (
                                  <div className="px-2 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                    {group.label}
                                  </div>
                                )}
                                {group.entries.map((entry) => {
                                  const isSelected = String(option.currentValue) === entry.value;
                                  return (
                                    <button
                                      key={`${option.id}-${entry.value}`}
                                      type="button"
                                      disabled={disabled || isSelected}
                                      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                                      onClick={() => {
                                        onSelectOption(option.id, entry.value);
                                        setOpenSelectId(null);
                                      }}
                                    >
                                      <Icon
                                        icon={isSelected ? "lucide:check" : "lucide:circle"}
                                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
                                        {entry.description && (
                                          <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">
                                            {entry.description}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {option.currentValue ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        id={switchId(option.id)}
                        data-option-id={option.id}
                        checked={Boolean(option.currentValue)}
                        disabled={disabled}
                        onCheckedChange={(checked) => onBooleanOption(option.id, checked)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
