import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { labelForEffort, useComposerReasoning } from "#/composables/chat/useComposerGenerationControls";

const ComposerEffortPicker = () => {
  const {
    isAcp,
    supportsReasoning,
    isDisabled,
    efforts,
    defaultEffort,
    activeEffort,
    serviceTier,
    setEffort,
    setServiceTier,
  } = useComposerReasoning();
  const currentLabel = isAcp || supportsReasoning === false ? "Max" : labelForEffort(activeEffort);
  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-testid="composer-effort-picker"
            className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={isDisabled}
          />
        }
      >
        <span className="font-medium">{currentLabel}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Reasoning</div>
        {efforts.map((effort) => {
          const isActive = activeEffort === effort;
          return (
            <DropdownMenuItem
              key={effort}
              className={`flex items-center justify-between ${isActive ? "bg-accent" : ""}`}
              onClick={() => void setEffort(effort)}
            >
              <span className="flex items-center gap-2">
                <span>{labelForEffort(effort)}</span>
                {effort === defaultEffort && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Default
                  </span>
                )}
              </span>
              {isActive && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
        <div className="my-2 h-px bg-border" />
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Service Tier</div>
        <DropdownMenuItem
          className={`flex items-center justify-between ${serviceTier === "standard" ? "bg-accent" : ""}`}
          onClick={() => void setServiceTier("standard")}
        >
          <span className="flex items-center gap-2">
            <span>Standard</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Default
            </span>
          </span>
          {serviceTier === "standard" && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`flex flex-col items-start gap-0.5 ${serviceTier === "fast" ? "bg-accent" : ""}`}
          onClick={() => void setServiceTier("fast")}
        >
          <span className="flex w-full items-center justify-between">
            <span>Fast</span>
            {serviceTier === "fast" && <Icon icon="lucide:check" className="h-3.5 w-3.5" />}
          </span>
          <span className="text-xs text-muted-foreground">1.5× speed, increased usage</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (isDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={picker} />
        <TooltipContent>Not supported by this model</TooltipContent>
      </Tooltip>
    );
  }
  return picker;
};
export default ComposerEffortPicker;
