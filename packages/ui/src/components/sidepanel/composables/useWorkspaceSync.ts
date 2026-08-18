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

  const hasGitChange = useCallback((state: WorkspaceGitState | null, filePath: string): boolean => {
    const normalizedFilePath = normalizeWorkspaceKey(filePath);
    if (!state || !normalizedFilePath) {
      return false;
    }

    return state.changes.some((change) => normalizeWorkspaceKey(change.path) === normalizedFilePath);
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

  const refreshSelectedPreview = useCallback(async (clearIfMissing: boolean): Promise<void> => {
    const filePath = optionsRef.current.sessionState.selectedFilePath;
    if (!filePath) {
      setSelectedFilePreview(null);
      return;
    }

    if (!optionsRef.current.active) {
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    setLoadingFilePreview(true);

    try {
      const preview = await optionsRef.current.workspaceClient.readFilePreview(filePath);
      if (requestId !== previewRequestIdRef.current) {
        return;
      }

      setSelectedFilePreview(preview);
      if (!preview && clearIfMissing) {
        optionsRef.current.sidepanelStore.clearFile(optionsRef.current.sessionId);
      }
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setLoadingFilePreview(false);
      }
    }
  }, []);

  const refreshSelectedDiff = useCallback(
    async (clearIfMissing: boolean, stateOverride?: WorkspaceGitState | null): Promise<void> => {
      const filePath = optionsRef.current.sessionState.selectedDiffPath;
      if (!filePath) {
        setSelectedGitDiff(null);
        return;
      }

      if (!optionsRef.current.active) {
        return;
      }

      const activeWorkspacePath = optionsRef.current.workspacePath;
      if (!activeWorkspacePath) {
        setSelectedGitDiff(null);
        if (clearIfMissing) {
          optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
        }
        return;
      }

      const currentGitState = stateOverride ?? gitStateRef.current;
      if (clearIfMissing && !hasGitChange(currentGitState, filePath)) {
        setSelectedGitDiff(null);
        optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
        return;
      }

      const requestId = ++diffRequestIdRef.current;
      setLoadingGitDiff(true);

      try {
        const diff = await optionsRef.current.workspaceClient.getGitDiff(activeWorkspacePath, filePath);
        if (requestId !== diffRequestIdRef.current) {
          return;
        }

        setSelectedGitDiff(diff);
        if (!diff && clearIfMissing) {
          optionsRef.current.sidepanelStore.clearDiff(optionsRef.current.sessionId);
        }
      } finally {
        if (requestId === diffRequestIdRef.current) {
          setLoadingGitDiff(false);
        }
      }
    },
    [hasGitChange],
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

      try {
        if (kind !== "git") {
          const expandedDirectories = collectExpandedDirectories(fileTreeRef.current);
          const nextTree = toWorkspaceNodes(await optionsRef.current.workspaceClient.readDirectory(workspacePath));
          if (!isCurrentRequest(requestId, workspacePath)) {
            return;
          }

          await restoreExpandedDirectories(nextTree, expandedDirectories, requestId, workspacePath);
          if (!isCurrentRequest(requestId, workspacePath)) {
            return;
          }

          fileTreeRef.current = nextTree;
          setFileTree(nextTree);
        }

        const nextGitState = await optionsRef.current.workspaceClient.getGitStatus(workspacePath);
        if (!isCurrentRequest(requestId, workspacePath)) {
          return;
        }

        gitStateRef.current = nextGitState;
        setGitState(nextGitState);

        if (kind !== "git") {
          await refreshSelectedPreview(true);
        }

        await refreshSelectedDiff(true, nextGitState);
      } finally {
        if (kind !== "git" && isCurrentRequest(requestId, workspacePath)) {
          setLoadingFiles(false);
        }
      }
    },
    [isCurrentRequest, restoreExpandedDirectories, refreshSelectedPreview, refreshSelectedDiff],
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

  const ensureWatcherState = useCallback(
    async (workspacePath: string | null, active: boolean): Promise<void> => {
      const nextWorkspacePath = active ? workspacePath?.trim() || null : null;
      const previousWorkspacePath = watchedWorkspacePathRef.current;

      if (previousWorkspacePath && previousWorkspacePath !== nextWorkspacePath) {
        watchedWorkspacePathRef.current = null;
        await optionsRef.current.workspaceClient.unwatchWorkspace(previousWorkspacePath);
      }

      if (!nextWorkspacePath) {
        if (!workspacePath) {
          fileTreeRef.current = [];
          setFileTree([]);
          gitStateRef.current = null;
          setGitState(null);
          setSelectedFilePreview(null);
          setSelectedGitDiff(null);
        }
        return;
      }

      if (watchedWorkspacePathRef.current !== nextWorkspacePath) {
        await optionsRef.current.workspaceClient.registerWorkspace(nextWorkspacePath);
        await optionsRef.current.workspaceClient.watchWorkspace(nextWorkspacePath);
        watchedWorkspacePathRef.current = nextWorkspacePath;
      }

      await refreshWorkspace("full");
    },
    [refreshWorkspace],
  );

  useEffect(() => {
    void ensureWatcherState(options.workspacePath, options.active);
  }, [options.workspacePath, options.active, ensureWatcherState]);

  useEffect(() => {
    void refreshSelectedPreview(false);
  }, [options.sessionState.selectedFilePath, refreshSelectedPreview]);

  useEffect(() => {
    void refreshSelectedDiff(false);
  }, [options.sessionState.selectedDiffPath, refreshSelectedDiff]);

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
