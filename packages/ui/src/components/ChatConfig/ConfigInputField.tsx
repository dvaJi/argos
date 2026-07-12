import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import ConfigFieldHeader from "./ConfigFieldHeader";

interface ConfigInputFieldProps {
  icon: string;
  label: string;
  description?: string;
  modelValue: number | string | undefined;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  error?: string;
  hint?: string;
  onModelValueChange?: (value: number | string | undefined) => void;
}

export default function ConfigInputField({
  icon,
  label,
  description,
  modelValue,
  type = "text",
  min,
  max,
  step,
  placeholder,
  error,
  hint,
  onModelValueChange,
}: ConfigInputFieldProps) {
  return (
    <div className="space-y-4 px-2">
      <ConfigFieldHeader icon={icon} label={label} description={description} />
      <div className="space-y-3 pl-4 border-l-2 border-muted">
        <div className="space-y-2">
          <Label className="text-sm">{label}</Label>
          <Input
            value={modelValue ?? ""}
            type={type}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            className={error ? "border-destructive" : undefined}
            onChange={(e) => {
              const val = e.target.value;
              onModelValueChange?.(type === "number" ? Number(val) : val);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {error ? <span className="text-red-600 font-medium">{error}</span> : hint ? hint : null}
          </p>
        </div>
      </div>
    </div>
  );
}
