import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { SidePanelTab, WorkspaceNavSection, WorkspaceViewMode } from "@shared/presenter";

export interface WorkspaceArtifactContext {
  threadId: string;
  messageId: string;
  artifactId: string;
}

export interface WorkspaceSessionState {
  selectedArtifactContext: WorkspaceArtifactContext | null;
  selectedFilePath: string | null;
  selectedDiffPath: string | null;
  viewMode: WorkspaceViewMode;
  sections: Record<WorkspaceNavSection, boolean>;
}

const createSessionState = (): WorkspaceSessionState => ({
  selectedArtifactContext: null,
  selectedFilePath: null,
  selectedDiffPath: null,
  viewMode: "preview",
  sections: {
    artifacts: true,
    files: true,
    git: false,
    subagents: true,
  },
});

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persistToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const WIDTH_STORAGE_KEY = "chat-sidepanel-width";
const NAV_COLLAPSED_KEY = "workspace-nav-collapsed";
const NAV_WIDTH_KEY = "workspace-nav-width";

const NAV_MIN_WIDTH = 160;
const NAV_MAX_WIDTH = 360;
const NAV_DEFAULT_WIDTH = 200;

const clampNavWidth = (nextWidth: number) => {
  const widthValue = Number(nextWidth);
  if (!Number.isFinite(widthValue)) return NAV_DEFAULT_WIDTH;
  return Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, Math.round(widthValue)));
};

export const sidepanelStore = new Store({
  open: false,
  activeTab: "workspace" as SidePanelTab,
  width: loadFromStorage(WIDTH_STORAGE_KEY, 520),
  viewportWidth: typeof window === "undefined" ? 1548 : window.innerWidth,
  navCollapsed: loadFromStorage(NAV_COLLAPSED_KEY, false),
  navWidthStorage: loadFromStorage(NAV_WIDTH_KEY, NAV_DEFAULT_WIDTH),
  sessionStates: {} as Record<string, WorkspaceSessionState>,
});

export const getNormalizedWidth = () => {
  const maxWidth = Math.min(960, Math.round(sidepanelStore.state.viewportWidth * 0.62));
  const minWidth = Math.min(420, maxWidth);
  const widthValue = Number(sidepanelStore.state.width);
  if (!Number.isFinite(widthValue)) return Math.min(maxWidth, Math.max(minWidth, 520));
  return Math.min(maxWidth, Math.max(minWidth, Math.round(widthValue)));
};

export const getNavWidth = () => clampNavWidth(sidepanelStore.state.navWidthStorage);

export const setNavWidth = (nextWidth: number) => {
  const clamped = clampNavWidth(nextWidth);
  persistToStorage(NAV_WIDTH_KEY, clamped);
  sidepanelStore.setState((prev) => ({ ...prev, navWidthStorage: clamped }));
};

export const setNavCollapsed = (collapsed: boolean) => {
  persistToStorage(NAV_COLLAPSED_KEY, collapsed);
  sidepanelStore.setState((prev) => ({ ...prev, navCollapsed: collapsed }));
};

export const toggleNavCollapsed = () => {
  const next = !sidepanelStore.state.navCollapsed;
  persistToStorage(NAV_COLLAPSED_KEY, next);
  sidepanelStore.setState((prev) => ({ ...prev, navCollapsed: next }));
};

let cleanupResize: (() => void) | null = null;

if (typeof window !== "undefined") {
  const clampWidth = (nextWidth: number, maxWidth: number, minWidth: number) => {
    const widthValue = Number(nextWidth);
    if (!Number.isFinite(widthValue)) return Math.min(maxWidth, Math.max(minWidth, 520));
    return Math.min(maxWidth, Math.max(minWidth, Math.round(widthValue)));
  };

  const handleResize = () => {
    const viewportWidth = window.innerWidth;
    const maxWidth = Math.min(960, Math.round(viewportWidth * 0.62));
    const minWidth = Math.min(420, maxWidth);
    const nextWidth = clampWidth(sidepanelStore.state.width, maxWidth, minWidth);
    persistToStorage(WIDTH_STORAGE_KEY, nextWidth);
    sidepanelStore.setState((prev) => ({
      ...prev,
      viewportWidth,
      width: nextWidth,
    }));
  };

  window.addEventListener("resize", handleResize);
  cleanupResize = () => window.removeEventListener("resize", handleResize);
}

export const disposeSidepanel = () => {
  cleanupResize?.();
  cleanupResize = null;
};

const ensureSessionState = (sessionId: string): WorkspaceSessionState => {
  if (!sidepanelStore.state.sessionStates[sessionId]) {
    sidepanelStore.setState((prev) => ({
      ...prev,
      sessionStates: { ...prev.sessionStates, [sessionId]: createSessionState() },
    }));
  }
  return sidepanelStore.state.sessionStates[sessionId];
};

export const getSessionState = (sessionId: string | null | undefined): WorkspaceSessionState => {
  if (!sessionId) return createSessionState();
  return sidepanelStore.state.sessionStates[sessionId] ?? createSessionState();
};

export const ensureAndGetSessionState = (sessionId: string): WorkspaceSessionState => {
  return ensureSessionState(sessionId);
};

export const setWidth = (nextWidth: number) => {
  const maxWidth = Math.min(960, Math.round(sidepanelStore.state.viewportWidth * 0.62));
  const minWidth = Math.min(420, maxWidth);
  const widthValue = Number(nextWidth);
  let clamped: number;
  if (!Number.isFinite(widthValue)) {
    clamped = Math.min(maxWidth, Math.max(minWidth, 520));
  } else {
    clamped = Math.min(maxWidth, Math.max(minWidth, Math.round(widthValue)));
  }
  persistToStorage(WIDTH_STORAGE_KEY, clamped);
  sidepanelStore.setState((prev) => ({ ...prev, width: clamped }));
};

export const openWorkspace = (sessionId?: string | null) => {
  if (sessionId) ensureSessionState(sessionId);
  sidepanelStore.setState((prev) => ({ ...prev, open: true, activeTab: "workspace" }));
};

export const openBrowser = () => {
  sidepanelStore.setState((prev) => ({ ...prev, open: true, activeTab: "browser" }));
};

export const closePanel = () => {
  sidepanelStore.setState((prev) => ({ ...prev, open: false }));
};

export const toggleWorkspace = (sessionId?: string | null) => {
  if (sidepanelStore.state.open && sidepanelStore.state.activeTab === "workspace") {
    sidepanelStore.setState((prev) => ({ ...prev, open: false }));
    return;
  }
  openWorkspace(sessionId);
};

export const setViewMode = (sessionId: string, mode: WorkspaceViewMode) => {
  ensureSessionState(sessionId);
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: { ...prev.sessionStates[sessionId], viewMode: mode },
    },
  }));
};

export const toggleSection = (sessionId: string, section: WorkspaceNavSection) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: {
        ...prev.sessionStates[sessionId],
        sections: { ...current.sections, [section]: !current.sections[section] },
      },
    },
  }));
};

export const selectArtifact = (
  sessionId: string,
  context: WorkspaceArtifactContext | null,
  options?: { open?: boolean; viewMode?: WorkspaceViewMode },
) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: {
        ...current,
        selectedArtifactContext: context,
        selectedFilePath: null,
        selectedDiffPath: null,
        viewMode: options?.viewMode ?? current.viewMode,
        sections: { ...current.sections, artifacts: true },
      },
    },
  }));

  if (options?.open !== false) {
    openWorkspace(sessionId);
  }
};

export const selectFile = (
  sessionId: string,
  filePath: string,
  options?: { open?: boolean; viewMode?: WorkspaceViewMode },
) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: {
        ...current,
        selectedArtifactContext: null,
        selectedFilePath: filePath,
        selectedDiffPath: null,
        viewMode: options?.viewMode ?? current.viewMode,
        sections: { ...current.sections, files: true },
      },
    },
  }));

  if (options?.open !== false) {
    openWorkspace(sessionId);
  }
};

export const selectDiff = (sessionId: string, filePath: string, options?: { open?: boolean }) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: {
        ...current,
        selectedArtifactContext: null,
        selectedFilePath: null,
        selectedDiffPath: filePath,
        sections: { ...current.sections, git: true },
      },
    },
  }));

  if (options?.open !== false) {
    openWorkspace(sessionId);
  }
};

export const clearArtifact = (sessionId: string) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: { ...current, selectedArtifactContext: null },
    },
  }));
};

export const clearFile = (sessionId: string) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: { ...current, selectedFilePath: null },
    },
  }));
};

export const clearDiff = (sessionId: string) => {
  ensureSessionState(sessionId);
  const current = sidepanelStore.state.sessionStates[sessionId];
  sidepanelStore.setState((prev) => ({
    ...prev,
    sessionStates: {
      ...prev.sessionStates,
      [sessionId]: { ...current, selectedDiffPath: null },
    },
  }));
};

export function useSidepanelStore() {
  const state = useStore(sidepanelStore);
  return {
    ...state,
    getNormalizedWidth,
    getNavWidth,
    setNavWidth,
    setNavCollapsed,
    toggleNavCollapsed,
    disposeSidepanel,
    getSessionState,
    setWidth,
    openWorkspace,
    openBrowser,
    closePanel,
    toggleWorkspace,
    setViewMode,
    toggleSection,
    selectArtifact,
    selectFile,
    selectDiff,
    clearArtifact,
    clearFile,
    clearDiff,
  };
}
