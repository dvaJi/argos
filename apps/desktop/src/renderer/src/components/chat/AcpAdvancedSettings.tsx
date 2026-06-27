import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { Switch } from "@shadcn/components/ui/switch";
import type { AcpConfigOption } from "@shared/presenter";

interface AcpAdvancedSettingsProps {
  options: AcpConfigOption[];
  readOnly: boolean;
  isOptionSaving: (configId: string) => boolean;
  getOptionDisplayValue: (option: AcpConfigOption) => string;
  onSelectOption: (configId: string, value: string) => void;
  onBooleanOption: (configId: string, value: boolean) => void;
}

const switchId = (optionId: string) => `acp-advanced-option-${optionId}`;

/**
 * Advanced Settings popover for ACP agents. Surfaces the config options that
 * don't fit inline in the status bar. Selects use a Select; booleans use a
 * Switch. Built entirely from semantic theme tokens so it renders correctly in
 * light and dark mode.
 */
export default function AcpAdvancedSettings({
  options,
  readOnly,
  isOptionSaving,
  getOptionDisplayValue,
  onSelectOption,
  onBooleanOption,
}: AcpAdvancedSettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="acp-overflow-button h-6 w-6 px-0 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
          title="Advanced settings"
          aria-label="Advanced settings"
        >
          <Icon icon="lucide:settings-2" className="h-3.5 w-3.5" />
        </Button>
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
                    <Select value={String(option.currentValue)} onValueChange={(v) => onSelectOption(option.id, v)}>
                      <SelectTrigger disabled={disabled} className="h-8 w-[9rem] shrink-0 text-xs">
                        <span className="truncate">{getOptionDisplayValue(option)}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {(option.options ?? []).map((entry) => (
                          <SelectItem key={`${option.id}-${entry.value}`} value={entry.value}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
