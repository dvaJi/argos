import { useState, useEffect, useRef } from "react";
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

/**
 * Refs + setters shared by the module-scope workspace helpers. Bundling them
 * keeps every helper outside the React Compiler's view, which lets effects
 * depend on plain primitives instead of per-render closures.
 */
interface WorkspaceSyncDeps {
  optionsRef: { current: UseWorkspaceSyncOptions };
  syncRequestIdRef: { current: number };
  fileTreeRef: { current: WorkspaceFileNode[] };
  gitStateRef: { current: WorkspaceGitState | null };
  previewRequestIdRef: { current: number };
  diffRequestIdRef: { current: number };
  refreshTimerRef: { current: ReturnType<typeof setTimeout> | null };
  pendingKindRef: { current: WorkspaceInvalidationKind | null };
  watchedWorkspacePathRef: { current: string | null };
  setFileTree: (nodes: WorkspaceFileNode[]) => void;
  setGitState: (state: WorkspaceGitState | null) => void;
  setLoadingFiles: (loading: boolean) => void;
  setLoadingFilePreview: (loading: boolean) => void;
  setLoadingGitDiff: (loading: boolean) => void;
  setSelectedFilePreview: (preview: WorkspaceFilePreview | null) => void;
  setSelectedGitDiff: (diff: WorkspaceGitDiff | null) => void;
}

function isWorkspaceRequestCurrent(deps: WorkspaceSyncDeps, requestId: number, workspacePath: string | null): boolean {
  return (
    requestId === deps.syncRequestIdRef.current &&
    deps.optionsRef.current.active &&
    normalizeWorkspaceKey(deps.optionsRef.current.workspacePath) === normalizeWorkspaceKey(workspacePath)
  );
}

async function restoreExpandedDirectories(
  deps: WorkspaceSyncDeps,
  nodes: WorkspaceFileNode[],
  expandedDirectories: Set<string>,
  requestId: number,
  workspacePath: string | null,
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
    const children = toWorkspaceNodes(await deps.optionsRef.current.workspaceClient.expandDirectory(node.path));
    if (!isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
      return;
    }
    node.children = children;
    node.expanded = true;
    await restoreExpandedDirectories(deps, children, expandedDirectories, requestId, workspacePath);
    if (!isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
      return;
    }
  }
}

async function refreshWorkspace(deps: WorkspaceSyncDeps, kind: WorkspaceInvalidationKind): Promise<void> {
  const workspacePath = deps.optionsRef.current.workspacePath?.trim() || null;
  if (!workspacePath || !deps.optionsRef.current.active) {
    return;
  }
  const requestId = ++deps.syncRequestIdRef.current;
  if (kind !== "git") {
    deps.setLoadingFiles(true);
  }
  const finishLoadingFiles = () => {
    if (kind !== "git" && isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
      deps.setLoadingFiles(false);
    }
  };
  try {
    if (kind !== "git") {
      const expandedDirectories = collectExpandedDirectories(deps.fileTreeRef.current);
      const nextTree = toWorkspaceNodes(await deps.optionsRef.current.workspaceClient.readDirectory(workspacePath));
      if (!isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
        finishLoadingFiles();
        return;
      }
      await restoreExpandedDirectories(deps, nextTree, expandedDirectories, requestId, workspacePath);
      if (!isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
        finishLoadingFiles();
        return;
      }
      deps.fileTreeRef.current = nextTree;
      deps.setFileTree(nextTree);
    }
    const nextGitState = await deps.optionsRef.current.workspaceClient.getGitStatus(workspacePath);
    if (!isWorkspaceRequestCurrent(deps, requestId, workspacePath)) {
      finishLoadingFiles();
      return;
    }
    deps.gitStateRef.current = nextGitState;
    deps.setGitState(nextGitState);
    if (kind !== "git") {
      await loadSelectedPreview({
        clearIfMissing: true,
        filePath: deps.optionsRef.current.sessionState.selectedFilePath,
        optionsRef: deps.optionsRef,
        previewRequestIdRef: deps.previewRequestIdRef,
        setSelectedFilePreview: deps.setSelectedFilePreview,
        setLoadingFilePreview: deps.setLoadingFilePreview,
      });
    }
    await loadSelectedDiff({
      clearIfMissing: true,
      filePath: deps.optionsRef.current.sessionState.selectedDiffPath,
      stateOverride: nextGitState,
      optionsRef: deps.optionsRef,
      gitStateRef: deps.gitStateRef,
      diffRequestIdRef: deps.diffRequestIdRef,
      setSelectedGitDiff: deps.setSelectedGitDiff,
      setLoadingGitDiff: deps.setLoadingGitDiff,
    });
    finishLoadingFiles();
  } catch (error) {
    finishLoadingFiles();
    throw error;
  }
}

function resetWorkspaceState(deps: WorkspaceSyncDeps): void {
  deps.fileTreeRef.current = [];
  deps.setFileTree([]);
  deps.gitStateRef.current = null;
  deps.setGitState(null);
  deps.setSelectedFilePreview(null);
  deps.setSelectedGitDiff(null);
}

function scheduleRefresh(deps: WorkspaceSyncDeps, kind: WorkspaceInvalidationKind): void {
  if (!deps.optionsRef.current.active) {
    return;
  }
  if (
    !deps.pendingKindRef.current ||
    (deps.pendingKindRef.current === "git" && kind !== "git") ||
    (deps.pendingKindRef.current === "fs" && kind === "full")
  ) {
    deps.pendingKindRef.current = kind;
  }
  if (deps.refreshTimerRef.current) {
    clearTimeout(deps.refreshTimerRef.current);
  }
  deps.refreshTimerRef.current = setTimeout(() => {
    const nextKind = deps.pendingKindRef.current ?? kind;
    deps.refreshTimerRef.current = null;
    deps.pendingKindRef.current = null;
    void refreshWorkspace(deps, nextKind);
  }, REFRESH_DEBOUNCE_MS);
}

function handleWorkspaceInvalidated(
  deps: WorkspaceSyncDeps,
  payload: {
    workspacePath: string;
    kind: "fs" | "git" | "full";
    source: "watcher" | "fallback" | "lifecycle";
    version: number;
  },
): void {
  const activeWorkspacePath = normalizeWorkspaceKey(deps.optionsRef.current.workspacePath?.trim() || null);
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
  scheduleRefresh(deps, isInvalidationKind(eventPayload.kind) ? eventPayload.kind : "full");
}

async function ensureWatcherState(
  deps: WorkspaceSyncDeps,
  params: { workspacePath: string | null; active: boolean },
): Promise<void> {
  const nextWorkspacePath = params.active ? params.workspacePath?.trim() || null : null;
  const previousWorkspacePath = deps.watchedWorkspacePathRef.current;
  if (previousWorkspacePath && previousWorkspacePath !== nextWorkspacePath) {
    deps.watchedWorkspacePathRef.current = null;
    await deps.optionsRef.current.workspaceClient.unwatchWorkspace(previousWorkspacePath);
  }
  if (!nextWorkspacePath) {
    if (!params.workspacePath) {
      resetWorkspaceState(deps);
    }
    return;
  }
  if (deps.watchedWorkspacePathRef.current !== nextWorkspacePath) {
    await deps.optionsRef.current.workspaceClient.registerWorkspace(nextWorkspacePath);
    await deps.optionsRef.current.workspaceClient.watchWorkspace(nextWorkspacePath);
    deps.watchedWorkspacePathRef.current = nextWorkspacePath;
  }
  await refreshWorkspace(deps, "full");
}
/** Loads the preview for `filePath` (module-scope: opaque to the React Compiler). */
async function loadSelectedPreview(args: {
  clearIfMissing: boolean;
  filePath: string | null;
  optionsRef: {
    current: UseWorkspaceSyncOptions;
  };
  previewRequestIdRef: {
    current: number;
  };
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
  optionsRef: {
    current: UseWorkspaceSyncOptions;
  };
  gitStateRef: {
    current: WorkspaceGitState | null;
  };
  diffRequestIdRef: {
    current: number;
  };
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
  // Plain bundle passed by argument to the module-scope helpers above — never a
  // dependency, so effect lists stay primitive-only and compiler-safe. Every
  // field is a stable ref or state setter, so a first-render capture is safe.
  const syncDepsRef = useRef<WorkspaceSyncDeps>({
    optionsRef,
    syncRequestIdRef,
    fileTreeRef,
    gitStateRef,
    previewRequestIdRef,
    diffRequestIdRef,
    refreshTimerRef,
    pendingKindRef,
    watchedWorkspacePathRef,
    setFileTree,
    setGitState,
    setLoadingFiles,
    setLoadingFilePreview,
    setLoadingGitDiff,
    setSelectedFilePreview,
    setSelectedGitDiff,
  });
  useEffect(() => {
    void ensureWatcherState(syncDepsRef.current, {
      workspacePath: options.workspacePath,
      active: options.active,
    });
  }, [options.workspacePath, options.active]);
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
    stopListenerRef.current = optionsRef.current.workspaceClient.onInvalidated((payload) =>
      handleWorkspaceInvalidated(syncDepsRef.current, payload),
    );
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
  }, [syncDepsRef]);
  const toggleNode = async (node: WorkspaceFileNode) => {
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
  };
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
