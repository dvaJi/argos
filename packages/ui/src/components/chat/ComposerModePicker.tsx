import { useEffect, useState, useCallback, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { createSessionClient } from "#api/SessionClient";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { draftStore, useDraftStore } from "#/stores/ui/draft";
import { useAgentStore } from "#/stores/ui/agent";
import type { PermissionMode } from "@argos/shared/types/agent-interface";

type ModeOption = {
  value: PermissionMode;
  label: string;
  description: string;
  icon: string;
  /** v1 only supports `default`/`full_access`; interim labels are disabled until the enum expands. */
  disabled?: boolean;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "default",
    label: "Supervised",
    description: "Ask before commands and file changes.",
    icon: "lucide:shield",
  },
  {
    value: "full_access",
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    icon: "lucide:pencil",
    disabled: true,
  },
  {
    value: "full_access",
    label: "Auto",
    description: "Smart providers approve routine actions; others still ask.",
    icon: "lucide:sparkles",
    disabled: true,
  },
  {
    value: "full_access",
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    icon: "lucide:unlock",
  },
];

const uniqueModeOptions = MODE_OPTIONS.filter((opt, idx, arr) => arr.findIndex((o) => o.label === opt.label) === idx);

const ComposerModePicker = () => {
  const agentState = useAgentStore();
  const sessionState = useSessionStore();
  void sessionState;
  const draftState = useDraftStore();
  void draftState;
  const sessionClient = useMemo(() => createSessionClient(), []);

  const hasActiveSession = getHasActiveSession();
  const activeSession = getActiveSession();

  const isAcpAgent = hasActiveSession
    ? activeSession?.providerId === "acp"
    : agentState.agents.find((a) => a.id === agentState.selectedAgentId)?.type === "acp";

  const [permissionMode, setPermissionMode] = useState<PermissionMode>("full_access");

  useEffect(() => {
    let cancelled = false;
    if (hasActiveSession && activeSession?.id) {
      void sessionClient
        .getPermissionMode(activeSession.id)
        .then((mode) => {
          if (!cancelled && mode) setPermissionMode(mode as PermissionMode);
        })
        .catch(() => {});
    } else {
      setPermissionMode((draftState.permissionMode as PermissionMode) ?? "full_access");
    }
    return () => {
      cancelled = true;
    };
  }, [hasActiveSession, activeSession?.id, draftState.permissionMode]);

  const currentLabel = permissionMode === "default" ? "Supervised" : "Full access";
  const currentIcon = permissionMode === "default" ? "lucide:shield" : "lucide:unlock";

  const handleSelect = useCallback(
    async (mode: PermissionMode) => {
      setPermissionMode(mode);
      if (hasActiveSession && activeSession?.id) {
        try {
          await sessionClient.setPermissionMode(activeSession.id, mode);
        } catch {}
      } else {
        draftStore.setState((prev) => ({ ...prev, permissionMode: mode }));
      }
    },
    [hasActiveSession, activeSession?.id, sessionClient],
  );

  if (isAcpAgent) {
    return null;
  }

  // avoid unused var lint
  void agentState;

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
        <Icon icon={currentIcon} className="h-3.5 w-3.5" />
        <span className="font-medium">{currentLabel}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-2">
        {uniqueModeOptions.map((opt) => {
          const isActive =
            (permissionMode === "default" && opt.label === "Supervised") ||
            (permissionMode === "full_access" && opt.label === "Full access");
          return (
            <DropdownMenuItem
              key={opt.label}
              disabled={opt.disabled}
              className={`flex flex-col items-start gap-1 rounded-md px-3 py-2 ${isActive ? "bg-accent" : ""}`}
              onClick={() => void handleSelect(opt.value)}
            >
              <span className="flex w-full items-center gap-2 font-medium">
                <Icon icon={opt.icon} className="h-3.5 w-3.5 shrink-0" />
                <span>{opt.label}</span>
                {opt.disabled && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    soon
                  </span>
                )}
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
