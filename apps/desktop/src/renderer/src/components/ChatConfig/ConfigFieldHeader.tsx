import { Icon } from "@iconify/react";
import { Label } from "@shadcn/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@shadcn/components/ui/tooltip";

interface ConfigFieldHeaderProps {
  icon: string;
  label: string;
  description?: string;
  size?: "sm" | "xs";
  value?: string | number;
}

export default function ConfigFieldHeader({ icon, label, description, size = "sm", value }: ConfigFieldHeaderProps) {
  return (
    <div className={`flex items-center ${value !== undefined ? "justify-between" : "space-x-2"}`}>
      <div className="flex items-center space-x-2">
        <Icon icon={icon} className="w-4 h-4 text-muted-foreground" />
        <Label className={size === "sm" ? "text-sm" : "text-xs font-medium"}>{label}</Label>
        {description && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger>
                <Icon icon="lucide:help-circle" className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {value !== undefined && <span className="text-xs text-muted-foreground">{value}</span>}
    </div>
  );
}
