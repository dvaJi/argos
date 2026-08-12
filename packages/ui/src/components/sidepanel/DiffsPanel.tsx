import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useThemeStore } from "#/stores/theme";
import { useSidepanelStore, setDiffsSelection, resetDiffsSelection } from "#/stores/ui/sidepanel";
import { DiffsPatchPane } from "./viewer/DiffsPatchPane";
import type { WorkspaceGitFileChange, WorkspaceGitState } from "@argos/shared/presenter";

interface DiffsPanelProps {
  sessionId: string;
  workspacePath: string | null;
}

const STATUS_ICON: Record<string, { icon: string; className: string }> = {
  added: { icon: "lucide:plus", className: "text-emerald-500" },
  modified: { icon: "lucide:pencil", className: "text-amber-500" },
  deleted: { icon: "lucide:minus", className: "text-red-500" },
  renamed: { icon: "lucide:arrow-right", className: "text-sky-500" },
  copied: { icon: "lucide:copy", className: "text-sky-500" },
  untracked: { icon: "lucide:question", className: "text-violet-500" },
  ignored: { icon: "lucide:eye-off", className: "text-muted-foreground" },
  unmerged: { icon: "lucide:alert-triangle", className: "text-red-500" },
};

const getStatusMeta = (change: WorkspaceGitFileChange) => STATUS_ICON[change.type] ?? STATUS_ICON.modified;
const getBasename = (value: string) =>
  value
    .split(/[\\/]+/)
    .filter(Boolean)
    .pop() ?? value;

/**
 * Top-level sidepanel "Diffs" tab. Lists every changed file (from `getGitStatus`)
 * and renders its diff with `@pierre/diffs <PatchDiff>`, consuming the unified
 * patch text the presenter already returns. Selecting a file focuses its diff;
 * the default view shows the full staged + unstaged patch for the workspace.
 */
export function DiffsPanel({ workspacePath }: DiffsPanelProps) {
  const workspaceClient = useMemo(() => createWorkspaceClient(), []);
  const themeStore = useThemeStore();
  const sidepanelStore = useSidepanelStore();
  // Selection lives in the sidepanel store so chat links can open a file's diff.
  // `selectionReady` gates the patch load: the tab never loads the slow full-
  // workspace diff until a real selection exists (auto first-file or user click).
  const selectedPath = sidepanelStore.diffsSelectedPath;
  const selectionReady = sidepanelStore.diffsSelectionReady;

  const [state, setState] = useState<WorkspaceGitState | null>(null);
  const [patch, setPatch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingPatch, setLoadingPatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    setError(null);
    try {
      const next = await workspaceClient.getGitStatus(workspacePath);
      setState(next);
    } catch (err) {
      console.error("[DiffsPanel] status failed", err);
      setError("Failed to load git status");
    } finally {
      setLoading(false);
    }
  }, [workspaceClient, workspacePath]);

  const loadPatch = useCallback(
    async (filePath: string | null) => {
      if (!workspacePath) return;
      setLoadingPatch(true);
      try {
        const diff = await workspaceClient.getGitDiff(workspacePath, filePath ?? undefined);
        const text = diff ? [diff.staged, diff.unstaged].filter(Boolean).join("\n\n") : "";
        setPatch(text);
      } catch (err) {
        console.error("[DiffsPanel] diff failed", err);
        setPatch("");
      } finally {
        setLoadingPatch(false);
      }
    },
    [workspaceClient, workspacePath],
  );

  useEffect(() => {
    if (!workspacePath) return;
    let cancelled = false;
    let off: (() => void) | undefined;
    void (async () => {
      try {
        await workspaceClient.registerWorkspace(workspacePath);
        await workspaceClient.watchWorkspace(workspacePath);
      } catch (error) {
        console.error("[DiffsPanel] register/watch failed", error);
      }
      if (cancelled) {
        void workspaceClient.unwatchWorkspace(workspacePath);
        return;
      }
      off = workspaceClient.onInvalidated((payload) => {
        if (payload.workspacePath !== workspacePath) return;
        void loadStatus();
      });
      void loadStatus();
    })();
    return () => {
      cancelled = true;
      off?.();
      void workspaceClient.unwatchWorkspace(workspacePath);
    };
  }, [workspacePath, loadStatus, workspaceClient]);

  // Reset selection when the workspace changes (different session/project).
  useEffect(() => {
    resetDiffsSelection();
    setPatch("");
  }, [workspacePath]);

  // Load the focused diff only once a real selection exists — never the slow
  // full-workspace patch by default (null = "All changes", an explicit user choice).
  useEffect(() => {
    if (!selectionReady) return;
    void loadPatch(selectedPath);
  }, [selectedPath, selectionReady, loadPatch]);

  const changes = useMemo(() => state?.changes ?? [], [state]);

  // Auto-select the first changed file once status loads (no prior selection),
  // so the default view is a single-file diff instead of every file at once.
  useEffect(() => {
    if (selectionReady) return;
    if (!state) return;
    setDiffsSelection(changes[0]?.path ?? null);
  }, [state, changes, selectionReady]);

  const handleSelect = useCallback((filePath: string) => {
    setDiffsSelection(filePath);
  }, []);

  const handleShowAll = useCallback(() => {
    setDiffsSelection(null);
  }, []);

  if (!workspacePath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No workspace selected
      </div>
    );
  }

  if (loading && !state) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading diffs...</div>
    );
  }

  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>;
  }

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Not a git repository</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="diffs-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon icon="lucide:git-branch" className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{state.branch ?? "HEAD"}</span>
          {(state.ahead > 0 || state.behind > 0) && (
            <span>
              {state.ahead > 0 && `↑${state.ahead}`} {state.behind > 0 && `↓${state.behind}`}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{changes.length} changes</span>
      </div>

      {changes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No changes
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-48 shrink-0 overflow-auto border-r">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                selectedPath === null ? "bg-accent font-medium text-foreground" : "text-muted-foreground"
              }`}
              onClick={handleShowAll}
            >
              <Icon icon="lucide:layers" className="h-3.5 w-3.5" />
              All changes
            </button>
            {changes.map((change) => {
              const meta = getStatusMeta(change);
              const active = selectedPath === change.path;
              return (
                <button
                  key={change.path}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                    active ? "bg-accent font-medium text-foreground" : "text-muted-foreground"
                  }`}
                  title={change.relativePath}
                  onClick={() => handleSelect(change.path)}
                >
                  <Icon icon={meta.icon} className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} />
                  <span className="truncate">{getBasename(change.relativePath)}</span>
                </button>
              );
            })}
          </aside>

          <div className="min-w-0 flex-1 overflow-hidden">
            {!selectionReady || loadingPatch ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <DiffsPatchPane patch={patch} diffStyle={themeStore.isDark ? "unified" : "unified"} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
