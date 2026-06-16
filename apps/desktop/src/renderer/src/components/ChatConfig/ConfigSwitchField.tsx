import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";

interface ConfigSwitchFieldProps {
  label: string;
  modelValue: boolean;
  onModelValueChange?: (value: boolean) => void;
}

export default function ConfigSwitchField({ label, modelValue, onModelValueChange }: ConfigSwitchFieldProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
      </div>
      <Switch checked={modelValue} onCheckedChange={onModelValueChange} />
    </div>
  );
}
