import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { usePreSessionAgentType } from "#/composables/chat/usePreSessionAgentType";
import {
  AGENT_MODE_OPTIONS,
  useComposerAgentMode,
} from "#/composables/chat/useComposerGenerationControls";

const ComposerModePicker = () => {
  const sessionState = useSessionStore();
  void sessionState;
  const preSessionAgentType = usePreSessionAgentType();
  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();
  const isAcpAgent = hasActiveSession ? activeSession?.providerId === "acp" : preSessionAgentType === "acp";
  const { mode, label, icon, setMode } = useComposerAgentMode();
  if (isAcpAgent) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-testid="composer-mode-picker"
            className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Icon icon={icon} className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-2">
        {AGENT_MODE_OPTIONS.map((opt) => {
          const isActive = mode === opt.value;
          return (
            <DropdownMenuItem
              key={opt.label}
              className={`flex flex-col items-start gap-1 rounded-md px-3 py-2 ${isActive ? "bg-accent" : ""}`}
              onClick={() => void setMode(opt.value)}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                <Icon icon={opt.icon} className="h-3.5 w-3.5 shrink-0" />
                <span>{opt.label}</span>
                {isActive && <Icon icon="lucide:check" className="ml-auto h-3.5 w-3.5" />}
              </span>
              <span className="pl-5 text-xs text-muted-foreground">{opt.description}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
export default ComposerModePicker;
