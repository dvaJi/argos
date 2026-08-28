import { useState, useEffect, useRef, useCallback } from "react";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import type {
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceGitDiff,
  WorkspaceGitState,
  WorkspaceInvalidationKind,
} from "@argos/shared/presenter";
import type { WorkspaceSessionState } from "#/stores/ui/sidepanel";

interface UseWorkspaceSyncOptions {
  sessionId: string;
  workspacePath: string | null;
  active: boolean;
  sessionState: WorkspaceSessionState;
  workspaceClient: Pick<
    ReturnType<typeof createWorkspaceClient>,
    | "registerWorkspace"
    | "watchWorkspace"
    | "unwatchWorkspace"
    | "readDirectory"
    | "expandDirectory"
    | "readFilePreview"
    | "getGitStatus"
    | "getGitDiff"
    | "onInvalidated"
  >;
  sidepanelStore: {
    clearFile(sessionId: string): void;
    clearDiff(sessionId: string): void;
  };
}

const REFRESH_DEBOUNCE_MS = 120;

const normalizeWorkspaceKey = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  return value
    .trim()
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/");
};

const isInvalidationKind = (value: unknown): value is WorkspaceInvalidationKind => {
  return value === "fs" || value === "git" || value === "full";
};

const hasGitChange = (state: WorkspaceGitState | null, filePath: string): boolean => {
  const normalizedFilePath = normalizeWorkspaceKey(filePath);
  if (!state || !normalizedFilePath) {
    return false;
  }

  return state.changes.some((change) => normalizeWorkspaceKey(change.path) === normalizedFilePath);
};

/** Loads the preview for `filePath` (module-scope: opaque to the React Compiler). */
async function loadSelectedPreview(args: {
  clearIfMissing: boolean;
  filePath: string | null;
  optionsRef: { current: UseWorkspaceSyncOptions };
  previewRequestIdRef: { current: number };
  setSelectedFilePreview: (preview: WorkspaceFilePreview | null) => void;
  setLoadingFilePreview: (loading: boolean) => void;
}): Promise<void> {
  const { clearIfMissing, filePath, optionsRef } = args;
  if (!filePath) {
    args.setSelectedFilePreview(null);
    return;
  }

  if (!optionsRef.current.active) {
    return;
  }

  const requestId = ++args.previewRequestIdRef.current;
  args.setLoadingFilePreview(true);

  try {
    const preview = await optionsRef.current.workspaceClient.readFilePreview(filePath);
    if (requestId !== args.previewRequestIdRef.current) {
      return;
    }

    args.setSelectedFilePreview(preview);
    if (!preview && clearIfMissing) {
      optionsRef.current.sidepanelStore.clearFile(optionsRef.current.sessionId);
    }
    if (requestId === args.previewRequestIdRef.current) {
      args.setLoadingFilePreview(false);
    }
  } catch (error) {
    if (requestId === args.previewRequestIdRef.current) {
      args.setLoadingFilePreview(false);
    }
    throw error;
  }
}

/** Loads the diff for `filePath` (module-scope: opaque to the React Compiler). */
async function loadSelectedDiff(args: {
  clearIfMissing: boolean;
  filePath: string | null;
  stateOverride: WorkspaceGitState | null;
  optionsRef: { current: UseWorkspaceSyncOptions };
  gitStateRef: { current: WorkspaceGitState | null };
  diffRequestIdRef: { current: number };
  setSelectedGitDiff: (diff: WorkspaceGitDiff | null) => void;
  setLoadingGitDiff: (loading: boolean) => void;
}): Promise<void> {
  const { clearIfMissing, filePath, stateOverride, optionsRef, gitStateRef } = args;
  if (!filePath) {
    args.setSelectedGitDiff(null);
    return;
  }

  if (!optionsRef.current.active) {
    return;
  }

  const activeWorkspacePath = optionsRef.current.workspacePath;
  if (!activeWorkspacePath) {
    args.setSelectedGitDiff(null);
    if (clearIfMissing) {
      optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
    }
    return;
  }

  const currentGitState = stateOverride ?? gitStateRef.current;
  if (clearIfMissing && !hasGitChange(currentGitState, filePath)) {
    args.setSelectedGitDiff(null);
    optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
    return;
  }

  const requestId = ++args.diffRequestIdRef.current;
  args.setLoadingGitDiff(true);

  try {
    const diff = await optionsRef.current.workspaceClient.getGitDiff(activeWorkspacePath, filePath);
    if (requestId !== args.diffRequestIdRef.current) {
      return;
    }

    args.setSelectedGitDiff(diff);
    if (!diff && clearIfMissing) {
      optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
    }
    if (requestId === args.diffRequestIdRef.current) {
      args.setLoadingGitDiff(false);
    }
  } catch (error) {
    if (requestId === args.diffRequestIdRef.current) {
      args.setLoadingGitDiff(false);
    }
    throw error;
  }
}

/** Registers/unregisters the workspace watcher and refreshes state (module-scope: opaque to the React Compiler). */
async function ensureWatcherState(args: {
  workspacePath: string | null;
  active: boolean;
  optionsRef: { current: UseWorkspaceSyncOptions };
  watchedWorkspacePathRef: { current: string | null };
  refreshWorkspace: (kind: WorkspaceInvalidationKind) => Promise<void>;
  resetWorkspaceState: () => void;
}): Promise<void> {
  const { workspacePath, active, optionsRef, watchedWorkspacePathRef, refreshWorkspace, resetWorkspaceState } = args;
  const nextWorkspacePath = active ? workspacePath?.trim() || null : null;
  const previousWorkspacePath = watchedWorkspacePathRef.current;

  if (previousWorkspacePath && previousWorkspacePath !== nextWorkspacePath) {
    watchedWorkspacePathRef.current = null;
    await optionsRef.current.workspaceClient.unwatchWorkspace(previousWorkspacePath);
  }

  if (!nextWorkspacePath) {
    if (!workspacePath) {
      resetWorkspaceState();
    }
    return;
  }

  if (watchedWorkspacePathRef.current !== nextWorkspacePath) {
    await optionsRef.current.workspaceClient.registerWorkspace(nextWorkspacePath);
    await optionsRef.current.workspaceClient.watchWorkspace(nextWorkspacePath);
    watchedWorkspacePathRef.current = nextWorkspacePath;
  }

  await refreshWorkspace("full");
}

const toWorkspaceNodes = (nodes: unknown): WorkspaceFileNode[] => {
  return (nodes ?? []) as WorkspaceFileNode[];
};

const collectExpandedDirectories = (
  nodes: WorkspaceFileNode[],
  output: Set<string> = new Set<string>(),
): Set<string> => {
  for (const node of nodes) {
    if (!node.isDirectory || !node.expanded) {
      continue;
    }

    const key = normalizeWorkspaceKey(node.path);
    if (key) {
      output.add(key);
    }

    if (node.children?.length) {
      collectExpandedDirectories(node.children, output);
    }
  }

  return output;
};

export function useWorkspaceSync(options: UseWorkspaceSyncOptions) {
  const [fileTree, setFileTree] = useState<WorkspaceFileNode[]>([]);
  const [selectedFilePreview, setSelectedFilePreview] = useState<WorkspaceFilePreview | null>(null);
  const [selectedGitDiff, setSelectedGitDiff] = useState<WorkspaceGitDiff | null>(null);
  const [gitState, setGitState] = useState<WorkspaceGitState | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFilePreview, setLoadingFilePreview] = useState(false);
  const [loadingGitDiff, setLoadingGitDiff] = useState(false);

  const optionsRef = useRef(options);
  const fileTreeRef = useRef(fileTree);
  const gitStateRef = useRef(gitState);
  useEffect(() => {
    optionsRef.current = options;
    fileTreeRef.current = fileTree;
    gitStateRef.current = gitState;
  }, [options, fileTree, gitState]);

  const syncRequestIdRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const diffRequestIdRef = useRef(0);
  const watchedWorkspacePathRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKindRef = useRef<WorkspaceInvalidationKind | null>(null);
  const stopListenerRef = useRef<(() => void) | null>(null);

  const isCurrentRequest = useCallback((requestId: number, workspacePath: string): boolean => {
    return (
      requestId === syncRequestIdRef.current &&
      optionsRef.current.active &&
      normalizeWorkspaceKey(optionsRef.current.workspacePath) === normalizeWorkspaceKey(workspacePath)
    );
  }, []);

  const restoreExpandedDirectories = useCallback(
    async function restoreExpandedDirectories(
      nodes: WorkspaceFileNode[],
      expandedDirectories: Set<string>,
      requestId: number,
      workspacePath: string,
    ): Promise<void> {
      for (const node of nodes) {
        if (!node.isDirectory) {
          continue;
        }

        const key = normalizeWorkspaceKey(node.path);
        if (!key || !expandedDirectories.has(key)) {
          node.expanded = false;
          continue;
        }

        const children = toWorkspaceNodes(await optionsRef.current.workspaceClient.expandDirectory(node.path));
        if (!isCurrentRequest(requestId, workspacePath)) {
          return;
        }

        node.children = children;
        node.expanded = true;
        await restoreExpandedDirectories(children, expandedDirectories, requestId, workspacePath);
        if (!isCurrentRequest(requestId, workspacePath)) {
          return;
        }
      }
    },
    [isCurrentRequest],
  );

  const refreshWorkspace = useCallback(
    async (kind: WorkspaceInvalidationKind): Promise<void> => {
      const workspacePath = optionsRef.current.workspacePath?.trim() || null;
      if (!workspacePath || !optionsRef.current.active) {
        return;
      }

      const requestId = ++syncRequestIdRef.current;
      if (kind !== "git") {
        setLoadingFiles(true);
      }

      const finishLoadingFiles = () => {
        if (kind !== "git" && isCurrentRequest(requestId, workspacePath)) {
          setLoadingFiles(false);
        }
      };

      try {
        if (kind !== "git") {
          const expandedDirectories = collectExpandedDirectories(fileTreeRef.current);
          const nextTree = toWorkspaceNodes(await optionsRef.current.workspaceClient.readDirectory(workspacePath));
          if (!isCurrentRequest(requestId, workspacePath)) {
            finishLoadingFiles();
            return;
          }

          await restoreExpandedDirectories(nextTree, expandedDirectories, requestId, workspacePath);
          if (!isCurrentRequest(requestId, workspacePath)) {
            finishLoadingFiles();
            return;
          }

          fileTreeRef.current = nextTree;
          setFileTree(nextTree);
        }

        const nextGitState = await optionsRef.current.workspaceClient.getGitStatus(workspacePath);
        if (!isCurrentRequest(requestId, workspacePath)) {
          finishLoadingFiles();
          return;
        }

        gitStateRef.current = nextGitState;
        setGitState(nextGitState);

        if (kind !== "git") {
          await loadSelectedPreview({
            clearIfMissing: true,
            filePath: optionsRef.current.sessionState.selectedFilePath,
            optionsRef,
            previewRequestIdRef,
            setSelectedFilePreview,
            setLoadingFilePreview,
          });
        }

        await loadSelectedDiff({
          clearIfMissing: true,
          filePath: optionsRef.current.sessionState.selectedDiffPath,
          stateOverride: nextGitState,
          optionsRef,
          gitStateRef,
          diffRequestIdRef,
          setSelectedGitDiff,
          setLoadingGitDiff,
        });
        finishLoadingFiles();
      } catch (error) {
        finishLoadingFiles();
        throw error;
      }
    },
    [isCurrentRequest, restoreExpandedDirectories],
  );

  const scheduleRefresh = useCallback(
    (kind: WorkspaceInvalidationKind): void => {
      if (!optionsRef.current.active) {
        return;
      }

      if (
        !pendingKindRef.current ||
        (pendingKindRef.current === "git" && kind !== "git") ||
        (pendingKindRef.current === "fs" && kind === "full")
      ) {
        pendingKindRef.current = kind;
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        const nextKind = pendingKindRef.current ?? kind;
        refreshTimerRef.current = null;
        pendingKindRef.current = null;
        void refreshWorkspace(nextKind);
      }, REFRESH_DEBOUNCE_MS);
    },
    [refreshWorkspace],
  );

  const handleWorkspaceInvalidated = useCallback(
    (payload: {
      workspacePath: string;
      kind: "fs" | "git" | "full";
      source: "watcher" | "fallback" | "lifecycle";
      version: number;
    }) => {
      const activeWorkspacePath = normalizeWorkspaceKey(optionsRef.current.workspacePath?.trim() || null);
      if (!activeWorkspacePath) {
        return;
      }

      if (!payload || typeof payload !== "object") {
        return;
      }

      const eventPayload = payload as Partial<{
        workspacePath: string;
        kind: WorkspaceInvalidationKind;
      }>;
      const payloadWorkspacePath = normalizeWorkspaceKey(eventPayload.workspacePath);
      if (payloadWorkspacePath === null || payloadWorkspacePath !== activeWorkspacePath) {
        return;
      }

      const kind = isInvalidationKind(eventPayload.kind) ? eventPayload.kind : "full";
      scheduleRefresh(kind);
    },
    [scheduleRefresh],
  );

  const resetWorkspaceState = useCallback(() => {
    fileTreeRef.current = [];
    setFileTree([]);
    gitStateRef.current = null;
    setGitState(null);
    setSelectedFilePreview(null);
    setSelectedGitDiff(null);
  }, []);

  useEffect(() => {
    void ensureWatcherState({
      workspacePath: options.workspacePath,
      active: options.active,
      optionsRef,
      watchedWorkspacePathRef,
      refreshWorkspace,
      resetWorkspaceState,
    });
  }, [options.workspacePath, options.active, refreshWorkspace, resetWorkspaceState]);

  useEffect(() => {
    void loadSelectedPreview({
      clearIfMissing: false,
      filePath: options.sessionState.selectedFilePath,
      optionsRef,
      previewRequestIdRef,
      setSelectedFilePreview,
      setLoadingFilePreview,
    });
  }, [options.sessionState.selectedFilePath]);

  useEffect(() => {
    void loadSelectedDiff({
      clearIfMissing: false,
      filePath: options.sessionState.selectedDiffPath,
      stateOverride: null,
      optionsRef,
      gitStateRef,
      diffRequestIdRef,
      setSelectedGitDiff,
      setLoadingGitDiff,
    });
  }, [options.sessionState.selectedDiffPath]);

  useEffect(() => {
    stopListenerRef.current = optionsRef.current.workspaceClient.onInvalidated(handleWorkspaceInvalidated);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      stopListenerRef.current?.();
      stopListenerRef.current = null;

      if (watchedWorkspacePathRef.current) {
        const workspacePath = watchedWorkspacePathRef.current;
        watchedWorkspacePathRef.current = null;
        void optionsRef.current.workspaceClient.unwatchWorkspace(workspacePath);
      }
    };
  }, [handleWorkspaceInvalidated]);

  const toggleNode = useCallback(async (node: WorkspaceFileNode) => {
    if (!node.isDirectory) {
      return;
    }

    if (node.expanded) {
      node.expanded = false;
    } else {
      if (!node.children) {
        node.children = toWorkspaceNodes(await optionsRef.current.workspaceClient.expandDirectory(node.path));
      }
      node.expanded = true;
    }

    const next = [...fileTreeRef.current];
    fileTreeRef.current = next;
    setFileTree(next);
  }, []);

  return {
    fileTree,
    selectedFilePreview,
    selectedGitDiff,
    gitState,
    loadingFiles,
    loadingFilePreview,
    loadingGitDiff,
    toggleNode,
  };
}
