import type { FC } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Switch } from "#shadcn/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "#shadcn/components/ui/dropdown-menu";
import { Separator } from "#shadcn/components/ui/separator";

interface ServerInfo {
  name: string;
  icons: string;
  descriptions: string;
  command: string;
  args: string[];
  enabled: boolean;
  isRunning: boolean;
  type?: string;
  baseUrl?: string;
  errorMessage?: string;
  source?: string;
  sourceId?: string;
}

interface McpServerCardProps {
  server: ServerInfo;
  isBuiltIn?: boolean;
  isManaged?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  toolsCount?: number;
  promptsCount?: number;
  resourcesCount?: number;
  onToggle?: () => void;
  onRuntimeToggle?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  onViewLogs?: () => void;
  onRestart?: () => void;
  onViewTools?: () => void;
  onViewPrompts?: () => void;
  onViewResources?: () => void;
  onClick?: () => void;
}

const McpServerCard: FC<McpServerCardProps> = ({
  server,
  isBuiltIn = false,
  isManaged = false,
  isLoading = false,
  disabled = false,
  toolsCount,
  promptsCount,
  resourcesCount,
  onToggle,
  onRuntimeToggle,
  onEdit,
  onRemove,
  onViewTools,
  onViewPrompts,
  onViewResources,
  onClick,
}) => {
  const canEdit = !isManaged;
  const hasMenuActions = canEdit || !isBuiltIn;

  const fullDescription = isBuiltIn ? server.descriptions : server.descriptions;

  const serverStatus = (() => {
    if (isLoading) return "loading";
    if (server.errorMessage) return "error";
    if (server.isRunning) return "running";
    return "stopped";
  })();

  const statusConfig = (() => {
    switch (serverStatus) {
      case "running":
        return { dot: "bg-green-500", text: "Running", color: "text-green-600 dark:text-green-400" };
      case "loading":
        return {
          dot: "bg-blue-500 animate-pulse",
          text: "Starting",
          color: "text-blue-600 dark:text-blue-400",
        };
      case "error":
        return { dot: "bg-red-500", text: "Error", color: "text-red-600 dark:text-red-400" };
      default:
        return { dot: "bg-gray-400", text: "Stopped", color: "text-muted-foreground" };
    }
  })();

  return (
    <div
      className="bg-card flex flex-col shadow-sm border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md group cursor-pointer"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="px-4 py-2 flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="shrink-0">{server.icons}</span>
            <h3 className="text-sm font-bold truncate flex-1">{server.name}</h3>
          </div>

          {hasMenuActions && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                <Icon icon="lucide:more-horizontal" className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.();
                    }}
                  >
                    <Icon icon="lucide:edit-3" className="h-4 w-4 mr-2" />
                    Edit Server
                  </DropdownMenuItem>
                )}
                {canEdit && !isBuiltIn && <DropdownMenuSeparator />}
                {!isBuiltIn && (
                  <DropdownMenuItem
                    disabled={disabled}
                    className="text-red-600 dark:text-red-400/90 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40 dark:focus:text-red-300 [&_svg]:text-current"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove?.();
                    }}
                  >
                    <Icon icon="lucide:trash-2" className="h-4 w-4 mr-2" />
                    Remove Server
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <p
          className="text-xs text-secondary-foreground overflow-hidden leading-5 break-all mb-2 line-clamp-1"
          style={{ minHeight: "1rem" }}
        >
          {fullDescription}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <div className={["w-2 h-2 rounded-full", statusConfig.dot].join(" ")} />
            <span className={["text-xs", statusConfig.color].join(" ")}>{statusConfig.text}</span>
            {server.errorMessage && (
              <Tooltip>
                <TooltipTrigger>
                  <Icon icon="lucide:alert-circle" className="w-3 h-3 text-red-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">{server.errorMessage}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={disabled || isLoading}
              aria-label={`${server.isRunning ? "Stop" : "Start"} ${server.name}`}
              onClick={onRuntimeToggle}
            >
              <Icon icon={server.isRunning ? "lucide:square" : "lucide:play"} className="size-3" />
              {server.isRunning ? "Stop" : "Start"}
            </Button>
            <Switch checked={server.enabled} disabled={disabled || isLoading} onCheckedChange={onToggle} />
          </div>
        </div>
      </div>

      <div className="flex flex-row border-t h-9 items-center">
        {toolsCount !== undefined && (
          <Button
            variant="ghost"
            className="h-full flex-1 text-xs hover:bg-secondary rounded-none"
            disabled={disabled || toolsCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              onViewTools?.();
            }}
          >
            <Icon icon="lucide:wrench" className="h-3 w-3 mr-1" />
            {toolsCount}
          </Button>
        )}
        <Separator orientation="vertical" className="h-5" />
        {promptsCount !== undefined && (
          <Button
            variant="ghost"
            className="h-full flex-1 text-xs hover:bg-secondary rounded-none"
            disabled={disabled || promptsCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              onViewPrompts?.();
            }}
          >
            <Icon icon="lucide:message-square-quote" className="h-3 w-3 mr-1" />
            {promptsCount}
          </Button>
        )}
        <Separator orientation="vertical" className="h-5" />
        {resourcesCount !== undefined && (
          <Button
            variant="ghost"
            className="h-full flex-1 text-xs hover:bg-secondary rounded-none"
            disabled={disabled || resourcesCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              onViewResources?.();
            }}
          >
            <Icon icon="lucide:folder" className="h-3 w-3 mr-1" />
            {resourcesCount}
          </Button>
        )}
      </div>
    </div>
  );
};

export default McpServerCard;
