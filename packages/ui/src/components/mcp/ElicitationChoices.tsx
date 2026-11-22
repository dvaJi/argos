import { Button } from "#shadcn/components/ui/button";
import type { ElicitationOption } from "#/lib/elicitationOptions";

/**
 * Choice chips for an elicitation enum field. `multiple` toggles values in a
 * list; otherwise selecting a chip picks it (selecting it again clears it).
 * Emits option values, never labels: servers validate against the enum.
 */
export function ElicitationChoices({
  label,
  required,
  description,
  options,
  multiple,
  value,
  disabled,
  onChange,
}: {
  label: string;
  required?: boolean;
  description?: string;
  options: ElicitationOption[];
  multiple: boolean;
  value: string | string[] | undefined;
  disabled?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const selected = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  const pick = (option: string) => {
    const isOn = selected.includes(option);
    if (multiple) onChange(isOn ? selected.filter((item) => item !== option) : [...selected, option]);
    else onChange(isOn ? "" : option);
  };
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <p className="text-xs font-medium">
        {label}
        {required && <span className="ml-1 text-muted-foreground">*</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected.includes(option.value)}
            variant={selected.includes(option.value) ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => pick(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
    </div>
  );
}
