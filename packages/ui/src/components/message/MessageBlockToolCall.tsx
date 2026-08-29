import { type FC, useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { summarizeToolCallPreview } from "@argos/shared/lib/toolCallSummary";
import { useThemeStore } from "#/stores/theme";
import { selectSession } from "#/stores/ui/session";
import { getLanguageFromFilename } from "@argos/shared/utils/codeLanguage";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { createDeviceClient } from "#api/DeviceClient";
import { MessageBlockToolCallImagePreview } from "./MessageBlockToolCallImagePreview";
import "./MessageBlockToolCall.css";
interface MessageBlockToolCallProps {
  block: DisplayAssistantMessageBlock;
  messageId?: string;
  threadId?: string;
}
type ExpansionSource = "auto" | "manual" | null;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const coerceNumericParam = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
type SubagentProgressTask = {
  normalizedId: string;
  taskId: string;
  title: string;
  label: string;
  slotId: string;
  sessionId?: string | null;
  targetAgentId?: string | null;
  targetAgentName: string;
  status: string;
  previewMarkdown?: string;
  updatedAt?: number;
  resultSummary?: string;
};
type RawSubagentProgressTask = Partial<SubagentProgressTask> & {
  displayName?: string;
};
type SubagentProgressPayload = {
  runId: string;
  mode: "parallel" | "chain";
  tasks: RawSubagentProgressTask[];
};
const parseSubagentProgress = (value: unknown): SubagentProgressPayload | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as SubagentProgressPayload;
    return Array.isArray(parsed?.tasks) ? parsed : null;
  } catch {
    return null;
  }
};
const matchesToolContractName = (toolName: string, expectedName: string): boolean =>
  toolName === expectedName || toolName.endsWith(`_${expectedName}`);
const normalizeOptionalText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const CodeBlockNode: FC<{
  node: {
    code: string;
  };
  isDark?: boolean;
  showHeader?: boolean;
}> = ({ node, isDark = false }) => {
  return (
    <pre
      className={[
        "text-xs p-2 overflow-auto rounded-md",
        isDark ? "bg-zinc-900 text-zinc-100" : "bg-zinc-50 text-zinc-900",
      ].join(" ")}
      style={{
        fontFamily: "var(--dc-code-font-family)",
        fontSize: "0.85em",
      }}
    >
      {node.code}
    </pre>
  );
};
const MessageBlockToolCallBase: FC<MessageBlockToolCallProps> = ({ block }) => {
  const themeStore = useThemeStore();
  const deviceClient = createDeviceClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [expansionSource, setExpansionSource] = useState<ExpansionSource>(null);
  const [autoExpandDismissed, setAutoExpandDismissed] = useState(false);
  const [paramsCopyText, setParamsCopyText] = useState("Copy");
  const [responseCopyText, setResponseCopyText] = useState("Copy");
  const paramsCopyResetTimerRef = useRef<number | null>(null);
  const responseCopyResetTimerRef = useRef<number | null>(null);
  const statusVariant = (() => {
    if (block.status === "error") return "error";
    if (block.status === "success") return "success";
    if (block.status === "loading") return "running";
    return "neutral";
  })();
  const functionLabel = block.tool_call?.name ?? "";
  const displayFunctionName = functionLabel || "Tool Call";
  const expandedToolTitle = (() => {
    if (!isExpanded || !block.tool_call) return "";
    const toolName = functionLabel || "Tool Call";
    let serverName = block.tool_call.server_name?.trim() ?? "";
    if (serverName.includes("/")) serverName = serverName.split("/").pop() ?? "";
    if (!serverName || serverName === toolName) return toolName;
    return `${serverName}.${toolName}`;
  })();
  const paramsText = block.tool_call?.params ?? "";
  const responseText = block.tool_call?.response ?? "";
  const hasParams = paramsText.trim().length > 0;
  const hasResponse = responseText.trim().length > 0;
  const imagePreviews = (block.tool_call?.imagePreviews ?? []).filter(
    (preview) =>
      typeof preview.data === "string" &&
      preview.data.trim().length > 0 &&
      typeof preview.mimeType === "string" &&
      preview.mimeType.trim().length > 0,
  );
  const hasImagePreviews = imagePreviews.length > 0;
  const parsedParams = (() => {
    const raw = paramsText.trim();
    if (!raw)
      return {
        isJson: false,
        value: "",
      };
    try {
      return {
        isJson: true,
        value: JSON.parse(raw) as unknown,
      };
    } catch {
      return {
        isJson: false,
        value: raw,
      };
    }
  })();
  const parsedParamsRecord = isRecord(parsedParams.value) ? parsedParams.value : null;
  const rawToolName = block.tool_call?.name?.trim().toLowerCase() ?? "";
  const isSubagentOrchestrator = rawToolName === "subagent_orchestrator";
  const isExecTool = (() => {
    const toolName = rawToolName;
    return matchesToolContractName(toolName, "exec") || matchesToolContractName(toolName, "skill_run");
  })();
  const isProcessTool = matchesToolContractName(rawToolName, "process");
  const isTerminalTool = isExecTool || isProcessTool;
  const shouldAutoExpand = (() => {
    if (isSubagentOrchestrator) return block.status === "loading";
    if (block.status !== "loading") return false;
    if (isProcessTool) return true;
    if (!isExecTool || !parsedParamsRecord) return false;
    if (parsedParamsRecord.background === true) return true;
    const timeoutMs = coerceNumericParam(parsedParamsRecord.timeoutMs);
    return timeoutMs !== null && timeoutMs >= 10000;
  })();
  const toolCallIdentity = block.tool_call?.id ?? `${block.tool_call?.name ?? "tool"}:${block.timestamp}`;
  const summaryText = (() => {
    if (isSubagentOrchestrator) {
      const progress =
        parseSubagentProgress(block.extra?.subagentProgress) ?? parseSubagentProgress(block.extra?.subagentFinal);
      if (progress) return `${progress.mode} - ${progress.tasks.length} tasks`;
    }
    const raw = paramsText.trim();
    if (!raw) return "";
    return summarizeToolCallPreview(raw, {
      toolName: functionLabel,
    });
  })();
  const subagentTasks = (() => {
    const progress =
      parseSubagentProgress(block.extra?.subagentProgress) ?? parseSubagentProgress(block.extra?.subagentFinal);
    return (progress?.tasks ?? []).map((task, index) => {
      const slotId = normalizeOptionalText(task.slotId);
      const displayName = normalizeOptionalText(task.displayName);
      const normalizedId = normalizeOptionalText(task.taskId) || slotId || `subagent-task-${index + 1}`;
      const label = displayName || slotId || "Unnamed Task";
      const title = normalizeOptionalText(task.title);
      return {
        ...task,
        normalizedId,
        taskId: normalizedId,
        title,
        label,
        slotId: slotId || normalizedId,
        sessionId: typeof task.sessionId === "string" ? task.sessionId : (task.sessionId ?? null),
        targetAgentId: typeof task.targetAgentId === "string" ? task.targetAgentId : (task.targetAgentId ?? null),
        targetAgentName: normalizeOptionalText(task.targetAgentName) || displayName || "Unnamed Agent",
        status: normalizeOptionalText(task.status) || "running",
      };
    });
  })();
  const statusIconName = (() => {
    if (!block.tool_call) return "lucide:circle-small";
    switch (statusVariant) {
      case "error":
        return "lucide:x";
      case "success":
      case "neutral":
      default:
        return "lucide:circle-small";
    }
  })();
  const statusIconClass = (() => {
    switch (statusVariant) {
      case "error":
        return "text-destructive";
      case "success":
        return "text-emerald-500";
      default:
        return "text-muted-foreground";
    }
  })();
  const isDiffTool = (() => {
    const name = block.tool_call?.name ?? "";
    const normalized = name.replace(/[_-]/g, "").toLowerCase();
    if (block.status !== "success") return false;
    return normalized === "edittext" || normalized === "textreplace";
  })();
  const diffData = (() => {
    if (!isDiffTool || !hasResponse) return null;
    try {
      const parsed = JSON.parse(responseText) as {
        success?: boolean;
        originalCode?: unknown;
        updatedCode?: unknown;
        language?: unknown;
        replacements?: unknown;
      };
      if (
        parsed.success === true &&
        typeof parsed.originalCode === "string" &&
        typeof parsed.updatedCode === "string"
      ) {
        return {
          originalCode: parsed.originalCode,
          updatedCode: parsed.updatedCode,
          language: typeof parsed.language === "string" ? parsed.language : undefined,
          replacements: typeof parsed.replacements === "number" ? parsed.replacements : undefined,
        };
      }
    } catch {}
    return null;
  })();
  const paramsPath = (() => {
    if (!paramsText) return "";
    try {
      const parsed = JSON.parse(paramsText) as {
        path?: unknown;
      };
      if (parsed && typeof parsed.path === "string") return parsed.path;
    } catch {}
    return "";
  })();
  const diffLanguage = diffData?.language || getLanguageFromFilename(paramsPath);
  const hasDiff = Boolean(diffData);
  const responseLayoutClass = (() => {
    if (hasDiff) return "flex-1 min-w-0 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 min-h-72 max-h-72";
    return "space-y-2 flex-1 min-w-0";
  })();
  const resetExpansionState = () => {
    setIsExpanded(false);
    setExpansionSource(null);
    setAutoExpandDismissed(false);
  };
  const syncAutoExpansionState = (
    status: DisplayAssistantMessageBlock["status"],
    autoExpandable: boolean,
    previousStatus?: DisplayAssistantMessageBlock["status"],
  ) => {
    if (status === "loading" && autoExpandable && !autoExpandDismissed && !isExpanded) {
      setIsExpanded(true);
      setExpansionSource("auto");
      return;
    }
    if (previousStatus === "loading" && status !== "loading" && expansionSource === "auto") {
      setIsExpanded(false);
      setExpansionSource(null);
      setAutoExpandDismissed(false);
      return;
    }
    if (status !== "loading" && expansionSource !== "manual") {
      setAutoExpandDismissed(false);
    }
  };
  const prevIdentityRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevIdentityRef.current !== undefined && toolCallIdentity !== prevIdentityRef.current) {
      resetExpansionState();
      syncAutoExpansionState(block.status, shouldAutoExpand);
    }
    prevIdentityRef.current = toolCallIdentity;
  }, [toolCallIdentity, block.status, shouldAutoExpand, resetExpansionState, syncAutoExpansionState]);

  // Status/auto-expand transition sync (adjusted during render so the React
  // Compiler can track it). Mirrors syncAutoExpansionState with the previous
  // status captured across renders.
  const [autoExpandSyncStatus, setAutoExpandSyncStatus] = useState<DisplayAssistantMessageBlock["status"] | undefined>(
    undefined,
  );
  const [autoExpandSyncShouldAutoExpand, setAutoExpandSyncShouldAutoExpand] = useState(shouldAutoExpand);
  if (autoExpandSyncStatus !== block.status || autoExpandSyncShouldAutoExpand !== shouldAutoExpand) {
    const previousStatus = autoExpandSyncStatus;
    setAutoExpandSyncStatus(block.status);
    setAutoExpandSyncShouldAutoExpand(shouldAutoExpand);
    if (block.status === "loading" && shouldAutoExpand && !autoExpandDismissed && !isExpanded) {
      setIsExpanded(true);
      setExpansionSource("auto");
    } else if (previousStatus === "loading" && block.status !== "loading" && expansionSource === "auto") {
      setIsExpanded(false);
      setExpansionSource(null);
      setAutoExpandDismissed(false);
    }
    if (block.status !== "loading" && expansionSource !== "manual") {
      setAutoExpandDismissed(false);
    }
  }
  const toggleExpanded = () => {
    if (isExpanded) {
      if (block.status === "loading" && shouldAutoExpand) setAutoExpandDismissed(true);
      setIsExpanded(false);
      setExpansionSource(null);
      return;
    }
    setIsExpanded(true);
    setExpansionSource("manual");
  };
  const copyParams = async () => {
    if (!hasParams) return;
    try {
      deviceClient.copyText(paramsText);
      setParamsCopyText("Copied!");
      if (paramsCopyResetTimerRef.current !== null) window.clearTimeout(paramsCopyResetTimerRef.current);
      paramsCopyResetTimerRef.current = window.setTimeout(() => {
        setParamsCopyText("Copy");
        paramsCopyResetTimerRef.current = null;
      }, 2000);
    } catch {}
  };
  const copyResponse = async () => {
    if (!hasResponse) return;
    try {
      deviceClient.copyText(responseText);
      setResponseCopyText("Copied!");
      if (responseCopyResetTimerRef.current !== null) window.clearTimeout(responseCopyResetTimerRef.current);
      responseCopyResetTimerRef.current = window.setTimeout(() => {
        setResponseCopyText("Copy");
        responseCopyResetTimerRef.current = null;
      }, 2000);
    } catch {}
  };
  const getSubagentStatusClass = (status: string): string => {
    if (status === "completed") return "bg-emerald-500/10 text-emerald-600";
    if (status === "error" || status === "cancelled") return "bg-destructive/10 text-destructive";
    if (status.startsWith("waiting")) return "bg-amber-500/10 text-amber-600";
    return "bg-muted text-muted-foreground";
  };
  const getSubagentStatusLabel = (status: string): string => {
    switch (status) {
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      case "cancelled":
        return "Cancelled";
      case "waiting_permission":
        return "Waiting Permission";
      case "waiting_question":
        return "Waiting Question";
      case "running":
        return "Running";
      case "queued":
        return "Queued";
      default:
        return status;
    }
  };
  const handleSubagentSessionOpen = (task: SubagentProgressTask) => {
    if (!task.sessionId) return;
    void selectSession(task.sessionId);
  };
  useEffect(() => {
    return () => {
      if (paramsCopyResetTimerRef.current !== null) {
        window.clearTimeout(paramsCopyResetTimerRef.current);
        paramsCopyResetTimerRef.current = null;
      }
      if (responseCopyResetTimerRef.current !== null) {
        window.clearTimeout(responseCopyResetTimerRef.current);
        responseCopyResetTimerRef.current = null;
      }
    };
  }, []);
  return (
    <div className="flex flex-col w-full">
      <div
        data-testid="tool-call-trigger"
        className="tool-call-pill inline-flex w-fit min-h-7 border rounded-lg items-center gap-2 px-2 py-1.5 text-xs leading-4 transition-colors duration-150 select-none overflow-hidden bg-accent hover:bg-accent/40"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        {statusVariant === "running" && (
          <span
            data-testid="tool-call-running-indicator"
            className="tool-call-status-ring shrink-0"
            aria-hidden="true"
          />
        )}
        {statusVariant !== "running" && (
          <Icon icon={statusIconName} className={["w-3.5 h-3.5 shrink-0", statusIconClass].join(" ")} />
        )}
        <div className="tool-call-labels flex items-center gap-2 font-mono font-medium min-w-0">
          <span data-testid="tool-call-name" className="shrink-0 text-xs text-foreground/80 leading-none">
            {displayFunctionName}
          </span>
          {summaryText && (
            <span data-testid="tool-call-summary" className="tool-call-summary text-[11px]" title={summaryText}>
              {summaryText}
            </span>
          )}
        </div>
        {hasImagePreviews && (
          <span
            data-testid="tool-call-image-badge"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
            title={`${imagePreviews.length} image(s)`}
          >
            <Icon icon="lucide:image" className="h-3 w-3" />
            {imagePreviews.length}
          </span>
        )}
      </div>

      {isExpanded && (
        <div
          data-testid="tool-call-details"
          className="rounded-lg border bg-muted text-card-foreground px-2 py-3 mt-2 mb-4 w-full"
        >
          {isSubagentOrchestrator ? (
            <div className="flex flex-col gap-1.5">
              {subagentTasks.map((task) => (
                <button
                  key={task.normalizedId}
                  data-testid="subagent-task-trigger"
                  type="button"
                  disabled={!task.sessionId}
                  className={[
                    "tool-call-pill inline-flex w-full min-h-7 border rounded-lg items-center gap-2 px-2 py-1.5 text-xs leading-4 transition-colors overflow-hidden",
                    task.sessionId ? "bg-background hover:bg-accent/60" : "cursor-default bg-background/80 opacity-70",
                  ].join(" ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubagentSessionOpen(task);
                  }}
                >
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      getSubagentStatusClass(task.status),
                    ].join(" ")}
                  >
                    {getSubagentStatusLabel(task.status)}
                  </span>
                  <span className="shrink-0 font-semibold text-foreground">{task.targetAgentName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{task.title || task.label}</span>
                  {task.sessionId && (
                    <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {expandedToolTitle && (
                <div
                  data-testid="tool-call-expanded-title"
                  className="truncate text-xs font-mono font-medium text-foreground/75"
                >
                  {expandedToolTitle}
                </div>
              )}

              {hasParams && (
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h5 className="text-xs font-medium text-accent-foreground flex flex-row gap-2 items-center">
                      <Icon icon="lucide:arrow-up-from-dot" className="w-4 h-4 text-foreground" />
                      Parameters
                    </h5>
                    <button
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyParams();
                      }}
                    >
                      <Icon icon="lucide:copy" className="w-3 h-3 inline-block mr-1" />
                      {paramsCopyText}
                    </button>
                  </div>
                  <div
                    data-testid="tool-call-params"
                    className="rounded-md border bg-background text-xs p-2 min-h-0 max-h-20 overflow-auto"
                  >
                    {paramsText}
                  </div>
                </div>
              )}

              {hasParams && hasResponse && <hr className="sm:hidden" />}

              {hasResponse && (
                <div className={responseLayoutClass}>
                  <div className="flex items-center justify-between gap-2">
                    <h5 className="text-xs font-medium text-accent-foreground flex flex-row gap-2 items-center">
                      <Icon
                        icon={isTerminalTool ? "lucide:terminal" : "lucide:arrow-down-to-dot"}
                        className="w-4 h-4 text-foreground"
                      />
                      {isTerminalTool ? "Terminal Output" : "Response"}
                    </h5>
                    <button
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyResponse();
                      }}
                    >
                      <Icon icon="lucide:copy" className="w-3 h-3 inline-block mr-1" />
                      {responseCopyText}
                    </button>
                  </div>
                  {diffData ? (
                    <>
                      <div className="min-h-0 overflow-auto">
                        <CodeBlockNode
                          node={
                            {
                              code: diffData.updatedCode,
                              language: diffLanguage,
                            } as {
                              code: string;
                              language: string;
                            }
                          }
                          isDark={themeStore.isDark}
                          showHeader={false}
                        />
                      </div>
                      {diffData.replacements !== undefined && (
                        <div className="text-xs text-muted-foreground">{diffData.replacements} replacement(s)</div>
                      )}
                    </>
                  ) : (
                    <pre
                      className="rounded-md border bg-background text-xs p-2 whitespace-pre-wrap break-words max-h-64 overflow-auto"
                      style={{
                        fontFamily: "var(--dc-code-font-family)",
                        fontSize: "0.85em",
                      }}
                    >
                      {responseText}
                    </pre>
                  )}
                </div>
              )}

              {hasImagePreviews && <MessageBlockToolCallImagePreview previews={imagePreviews} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
const MessageBlockToolCall = MessageBlockToolCallBase;
export default MessageBlockToolCall;
