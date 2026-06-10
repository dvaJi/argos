import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { useSidepanelStore } from "./ui/sidepanel";

export interface ArtifactState {
  id: string;
  type: string;
  title: string;
  content: string;
  status: "loading" | "loaded" | "error";
  language?: string;
}

const makeContextKey = (artifactId: string, messageId: string, threadId: string) =>
  `${threadId}:${messageId}:${artifactId}`;

interface ShowArtifactOptions {
  force?: boolean;
  open?: boolean;
  viewMode?: "preview" | "code";
}

interface ArtifactStoreState {
  currentArtifact: ArtifactState | null;
  currentMessageId: string | null;
  currentThreadId: string | null;
  dismissedContexts: Set<string>;
  completedContexts: Set<string>;
}

export const artifactStore = new Store<ArtifactStoreState>({
  currentArtifact: null,
  currentMessageId: null,
  currentThreadId: null,
  dismissedContexts: new Set<string>(),
  completedContexts: new Set<string>(),
});

export const isOpen = () => {
  const { currentArtifact, currentThreadId } = artifactStore.state;
  if (!currentArtifact || !currentThreadId) {
    return false;
  }

  const sidepanelStore = useSidepanelStore();
  const sessionState = sidepanelStore.getSessionState(currentThreadId);
  return (
    sidepanelStore.open &&
    sidepanelStore.activeTab === "workspace" &&
    sessionState.selectedArtifactContext?.artifactId === currentArtifact.id
  );
};

const applyArtifactSelection = (
  artifact: ArtifactState,
  messageId: string,
  threadId: string,
  options?: ShowArtifactOptions,
) => {
  artifactStore.setState((prev) => ({
    ...prev,
    currentArtifact: artifact,
    currentMessageId: messageId,
    currentThreadId: threadId,
  }));
  const sidepanelStore = useSidepanelStore();
  sidepanelStore.selectArtifact(
    threadId,
    {
      threadId,
      messageId,
      artifactId: artifact.id,
    },
    {
      open: options?.open,
      viewMode: options?.viewMode ?? "preview",
    },
  );
};

export const showArtifact = (
  artifact: ArtifactState,
  messageId: string,
  threadId: string,
  options?: ShowArtifactOptions,
) => {
  const contextKey = makeContextKey(artifact.id, messageId, threadId);

  if (!options?.force && artifactStore.state.dismissedContexts.has(contextKey)) {
    return;
  }

  if (options?.force) {
    artifactStore.setState((prev) => {
      const next = new Set(prev.dismissedContexts);
      next.delete(contextKey);
      return { ...prev, dismissedContexts: next };
    });
  }

  applyArtifactSelection(artifact, messageId, threadId, {
    open: options?.open ?? true,
    viewMode: options?.viewMode ?? "preview",
  });
};

export const hideArtifact = () => {
  const threadId = artifactStore.state.currentThreadId;
  artifactStore.setState((prev) => ({
    ...prev,
    currentArtifact: null,
    currentMessageId: null,
    currentThreadId: null,
  }));
  if (threadId) {
    const sidepanelStore = useSidepanelStore();
    sidepanelStore.clearArtifact(threadId);
  }
};

export const dismissArtifact = () => {
  const { currentArtifact, currentMessageId, currentThreadId } = artifactStore.state;
  if (currentArtifact && currentMessageId && currentThreadId) {
    const contextKey = makeContextKey(currentArtifact.id, currentMessageId, currentThreadId);
    artifactStore.setState((prev) => {
      const next = new Set(prev.dismissedContexts);
      next.add(contextKey);
      return { ...prev, dismissedContexts: next };
    });
  }
  hideArtifact();
};

export const validateContext = (messageId: string, threadId: string) => {
  return artifactStore.state.currentMessageId === messageId && artifactStore.state.currentThreadId === threadId;
};

export const updateArtifactContent = (updates: Partial<ArtifactState>) => {
  if (artifactStore.state.currentArtifact) {
    artifactStore.setState((prev) => ({
      ...prev,
      currentArtifact: { ...prev.currentArtifact!, ...updates },
    }));
  }
};

export const syncArtifact = (artifact: ArtifactState, messageId: string, threadId: string) => {
  if (!artifactStore.state.currentArtifact || validateContext(messageId, threadId)) {
    artifactStore.setState((prev) => ({
      ...prev,
      currentArtifact: artifact,
      currentMessageId: messageId,
      currentThreadId: threadId,
    }));
  }
};

export const completeArtifact = (artifact: ArtifactState, messageId: string, threadId: string) => {
  const contextKey = makeContextKey(artifact.id, messageId, threadId);
  const sidepanelStore = useSidepanelStore();
  const panelWasHidden = !sidepanelStore.open;
  const currentMatches =
    validateContext(messageId, threadId) && artifactStore.state.currentArtifact?.id === artifact.id;

  syncArtifact(artifact, messageId, threadId);

  if (artifactStore.state.completedContexts.has(contextKey)) {
    return;
  }

  if (currentMatches) {
    sidepanelStore.setViewMode(threadId, "preview");
  }

  artifactStore.setState((prev) => {
    const next = new Set(prev.completedContexts);
    next.add(contextKey);
    return { ...prev, completedContexts: next };
  });

  if (panelWasHidden && !artifactStore.state.dismissedContexts.has(contextKey)) {
    applyArtifactSelection(artifact, messageId, threadId, {
      open: true,
      viewMode: "preview",
    });
  }
};

export function useArtifactStore() {
  const state = useStore(artifactStore);
  return {
    ...state,
    isOpen,
    showArtifact,
    hideArtifact,
    dismissArtifact,
    validateContext,
    updateArtifactContent,
    syncArtifact,
    completeArtifact,
  };
}
