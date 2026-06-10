import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shadcn/components/ui/tooltip";
import type { ReactNode } from "react";

interface ToolbarButtonProps {
  icon: string;
  tooltip: string;
  variant?: "chat" | "newThread";
  isActive?: boolean;
  onClick?: () => void;
  extra?: ReactNode;
}

export default function ToolbarButton({
  icon,
  tooltip,
  variant = "chat",
  isActive = false,
  onClick,
  extra,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="outline"
          size="icon"
          className={[
            "w-7 h-7 text-xs rounded-lg",
            variant === "chat" ? "text-accent-foreground" : "",
            isActive ? "text-primary" : "",
          ].join(" ")}
          onClick={onClick}
        >
          <Icon icon={icon} className="w-4 h-4" />
          {extra}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
