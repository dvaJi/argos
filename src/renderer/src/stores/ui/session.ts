import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createChatClient } from "../../../api/ChatClient";
import { createConfigClient } from "../../../api/ConfigClient";
import { createOnboardingClient } from "../../../api/OnboardingClient";
import { createSessionClient } from "../../../api/SessionClient";
import { createTabClient } from "@api/TabClient";
import { getRuntimeWebContentsId } from "@api/runtime";
import type { GuidedOnboardingStepId } from "@shared/contracts/routes";
import type {
  DeepChatSubagentMeta,
  SessionKind,
  SessionListItem,
  SessionWithState,
  CreateSessionInput,
  SendMessageInput,
} from "@shared/types/agent-interface";
import { downloadBlob } from "@/lib/download";
import { readGuidedOnboardingResumeIntent, requestGuidedOnboardingResume } from "@/lib/onboardingResume";
import { agentStore, enabledAgents, setSelectedAgent } from "./agent";
import { pageRouterStore, goToChat, goToNewThread } from "./pageRouter";
import { messageStore, setCurrentSessionId, clearStreamingState, loadMessages } from "./message";
import { bindSessionStoreIpc } from "./sessionIpc";

export type UISessionStatus = "completed" | "working" | "error" | "none";

export interface UISession {
  id: string;
  title: string;
  agentId: string;
  status: UISessionStatus;
  projectDir: string;
  isPinned: boolean;
  isDraft: boolean;
  sessionKind: SessionKind;
  parentSessionId: string | null;
  subagentEnabled: boolean;
  subagentMeta: DeepChatSubagentMeta | null;
  createdAt: number;
  updatedAt: number;
}

export interface UIActiveSessionSummary extends UISession {
  providerId: string;
  modelId: string;
}

export interface SessionGroup {
  id: string;
  label: string;
  labelKey?: string;
  sessions: UISession[];
}

export type GroupMode = "time" | "project";
export type StartNewConversationOptions = {
  refresh?: boolean;
};
export type CloseSessionOptions = {
  refresh?: boolean;
};

const SIDEBAR_GROUP_MODE_KEY = "sidebar_group_mode";
const DEFAULT_GROUP_MODE: GroupMode = "project";
const DEFAULT_SESSION_PAGE_SIZE = 30;
const NO_PROJECT_GROUP_ID = "__no_project__";
const SESSION_TITLE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function mapSessionStatus(status: string): UISessionStatus {
  switch (status) {
    case "generating":
      return "working";
    case "error":
      return "error";
    case "idle":
      return "none";
    default:
      return "none";
  }
}

function mapToUISession(session: SessionListItem | SessionWithState): UISession {
  return {
    id: session.id,
    title: session.title,
    agentId: session.agentId,
    status: mapSessionStatus(session.status),
    projectDir: session.projectDir ?? "",
    isPinned: Boolean(session.isPinned),
    isDraft: Boolean(session.isDraft),
    sessionKind: session.sessionKind,
    parentSessionId: session.parentSessionId ?? null,
    subagentEnabled: session.subagentEnabled,
    subagentMeta: session.subagentMeta ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function mapToUIActiveSessionSummary(session: SessionWithState): UIActiveSessionSummary {
  return {
    ...mapToUISession(session),
    providerId: session.providerId,
    modelId: session.modelId,
  };
}

function createFallbackActiveSession(session: UISession): UIActiveSessionSummary {
  return {
    ...session,
    providerId: "",
    modelId: "",
  };
}

function isRegularSession(session: Pick<UISession, "sessionKind">): boolean {
  return (session.sessionKind ?? "regular") === "regular";
}

function getCurrentWebContentsId(): number {
  return getRuntimeWebContentsId() ?? -1;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function groupByTime(sessions: UISession[]): SessionGroup[] {
  const now = Date.now();
  const today = startOfDay(now);
  const yesterday = startOfDay(now - 86400000);
  const lastWeek = startOfDay(now - 7 * 86400000);

  const groups: Record<string, UISession[]> = {
    "common.time.today": [],
    "common.time.yesterday": [],
    "common.time.lastWeek": [],
    "common.time.older": [],
  };

  for (const session of sessions) {
    if (session.updatedAt >= today) groups["common.time.today"].push(session);
    else if (session.updatedAt >= yesterday) groups["common.time.yesterday"].push(session);
    else if (session.updatedAt >= lastWeek) groups["common.time.lastWeek"].push(session);
    else groups["common.time.older"].push(session);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([labelKey, items]) => ({ id: labelKey, label: labelKey, labelKey, sessions: items }));
}

function normalizeProjectGroupId(projectDir: string): string {
  const normalizedDir = projectDir.trim().replace(/[\\/]+$/, "");
  return normalizedDir || NO_PROJECT_GROUP_ID;
}

function getProjectGroupLabel(projectGroupId: string): { label: string; labelKey?: string } {
  if (projectGroupId === NO_PROJECT_GROUP_ID) {
    return {
      label: "common.project.none",
      labelKey: "common.project.none",
    };
  }

  const label = projectGroupId.split(/[\\/]/).pop() ?? projectGroupId;
  return { label };
}

function groupByProject(sessions: UISession[]): SessionGroup[] {
  const projectMap = new Map<string, UISession[]>();
  for (const session of sessions) {
    const projectGroupId = normalizeProjectGroupId(session.projectDir);
    if (!projectMap.has(projectGroupId)) {
      projectMap.set(projectGroupId, []);
    }
    projectMap.get(projectGroupId)!.push(session);
  }

  return Array.from(projectMap.entries()).map(([projectGroupId, groupedSessions]) => ({
    id: projectGroupId,
    ...getProjectGroupLabel(projectGroupId),
    sessions: groupedSessions,
  }));
}

function getContentType(format: "markdown" | "html" | "txt" | "nowledge-mem"): string {
  switch (format) {
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "html":
      return "text/html;charset=utf-8";
    case "txt":
      return "text/plain;charset=utf-8";
    case "nowledge-mem":
      return "application/json;charset=utf-8";
    default:
      return "text/plain;charset=utf-8";
  }
}

function compareSessions(left: UISession, right: UISession): number {
  const titleCompare = SESSION_TITLE_COLLATOR.compare(left.title.trim(), right.title.trim());
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return left.id.localeCompare(right.id);
}

function sortSessions(items: UISession[]): UISession[] {
  return [...items].sort((left, right) => {
    return compareSessions(left, right);
  });
}

function mergeSessions(current: UISession[], updates: UISession[]): UISession[] {
  const next = new Map(current.map((session) => [session.id, session]));

  for (const update of updates) {
    const existing = next.get(update.id);
    next.set(update.id, existing ? { ...existing, ...update } : update);
  }

  return sortSessions(Array.from(next.values()));
}

const sessionClient = createSessionClient();
const chatClient = createChatClient();
const configClient = createConfigClient();
const onboardingClient = createOnboardingClient();
const tabClient = createTabClient();
const myWebContentsId = getCurrentWebContentsId();
let rendererReadyNotified = false;
let groupModeLoadPromise: Promise<void> | null = null;
let groupModeWritePromise: Promise<void> = Promise.resolve();
let hasLoadedGroupMode = false;
let groupModeUpdateVersion = 0;
let initialPageRequestId = 0;
let nextPageRequestId = 0;

export const sessionStore = new Store({
  sessions: [] as UISession[],
  bootstrapActiveSession: null as UISession | null,
  activeSessionSummary: null as UIActiveSessionSummary | null,
  activeSessionId: null as string | null,
  groupMode: DEFAULT_GROUP_MODE as GroupMode,
  loading: false,
  loadingMore: false,
  hasLoadedInitialPage: false,
  hasMore: false,
  nextCursor: null as { updatedAt: number; id: string } | null,
  error: null as string | null,
});

const setActiveSessionId = (sessionId: string | null): void => {
  sessionStore.setState((prev) => ({ ...prev, activeSessionId: sessionId }));
  setCurrentSessionId(sessionId);
};

const notifyRendererReady = (): void => {
  if (rendererReadyNotified) return;
  rendererReadyNotified = true;
  void tabClient.notifyRendererReady();
};

notifyRendererReady();

const normalizeGroupMode = (value: unknown): GroupMode =>
  value === "time" || value === "project" ? value : DEFAULT_GROUP_MODE;

const loadGroupModePreference = async (): Promise<void> => {
  const loadVersion = groupModeUpdateVersion;

  try {
    const savedGroupMode = await configClient.getSetting(SIDEBAR_GROUP_MODE_KEY);
    if (groupModeUpdateVersion === loadVersion) {
      sessionStore.setState((prev) => ({ ...prev, groupMode: normalizeGroupMode(savedGroupMode) }));
    }
  } catch (loadError) {
    if (groupModeUpdateVersion === loadVersion) {
      sessionStore.setState((prev) => ({ ...prev, groupMode: DEFAULT_GROUP_MODE }));
    }
    console.warn("[sessionStore] Failed to load sidebar group mode:", loadError);
  } finally {
    hasLoadedGroupMode = true;
  }
};

const ensureGroupModeLoaded = async (): Promise<void> => {
  if (hasLoadedGroupMode) {
    return;
  }

  if (!groupModeLoadPromise) {
    groupModeLoadPromise = loadGroupModePreference().finally(() => {
      groupModeLoadPromise = null;
    });
  }

  await groupModeLoadPromise;
};

const clearActiveSessionSummary = () => {
  sessionStore.setState((prev) => ({ ...prev, activeSessionSummary: null }));
};

const updateBootstrapActiveSession = (session: UISession | null) => {
  sessionStore.setState((prev) => ({ ...prev, bootstrapActiveSession: session }));
};

const upsertSessions = (updates: UISession[]): void => {
  sessionStore.setState((prev) => ({ ...prev, sessions: mergeSessions(prev.sessions, updates) }));
};

const removeSessions = (sessionIds: string[]): void => {
  const targetIds = new Set(sessionIds);
  sessionStore.setState((prev) => {
    const nextSessions = prev.sessions.filter((session) => !targetIds.has(session.id));
    const nextBootstrap =
      prev.bootstrapActiveSession && targetIds.has(prev.bootstrapActiveSession.id) ? null : prev.bootstrapActiveSession;
    const nextSummary =
      prev.activeSessionSummary && targetIds.has(prev.activeSessionSummary.id) ? null : prev.activeSessionSummary;
    return {
      ...prev,
      sessions: nextSessions,
      bootstrapActiveSession: nextBootstrap,
      activeSessionSummary: nextSummary,
    };
  });
  if (sessionStore.state.activeSessionId && targetIds.has(sessionStore.state.activeSessionId)) {
    clearStreamingState();
    setActiveSessionId(null);
    goToNewThread();
  }
};

export const getActiveSession = (): UIActiveSessionSummary | undefined => {
  const s = sessionStore.state;
  const sessionId = s.activeSessionId;
  if (!sessionId) {
    return undefined;
  }

  if (s.activeSessionSummary?.id === sessionId) {
    return s.activeSessionSummary;
  }

  const lightweightSession =
    s.sessions.find((session) => session.id === sessionId) ??
    (s.bootstrapActiveSession?.id === sessionId ? s.bootstrapActiveSession : null);

  return lightweightSession ? createFallbackActiveSession(lightweightSession) : undefined;
};

export const getHasActiveSession = (): boolean => sessionStore.state.activeSessionId !== null;

export const getNewConversationTargetAgentId = (): string | null => {
  const selectedId =
    typeof agentStore.state.selectedAgentId === "string" ? agentStore.state.selectedAgentId.trim() : "";
  if (selectedId) {
    return selectedId;
  }

  const activeSession = getActiveSession();
  const activeAgentId = typeof activeSession?.agentId === "string" ? activeSession.agentId.trim() : "";
  if (activeAgentId) {
    return activeAgentId;
  }

  const agents = enabledAgents();
  const fallbackId = typeof agents[0]?.id === "string" ? agents[0].id.trim() : "";
  return fallbackId || null;
};

export const getSessionGroups = (): SessionGroup[] => getFilteredGroups(null);

const syncSelectedAgentToSession = (sessionId: string | null, availableSessions?: UISession[]): void => {
  if (!sessionId) {
    return;
  }

  const sessions = availableSessions ?? sessionStore.state.sessions;
  const targetSession =
    sessions.find((session) => session.id === sessionId) ??
    (sessionStore.state.bootstrapActiveSession?.id === sessionId ? sessionStore.state.bootstrapActiveSession : null);
  const targetAgentId = targetSession?.agentId?.trim();
  if (!targetAgentId || agentStore.state.selectedAgentId === targetAgentId) {
    return;
  }

  setSelectedAgent(targetAgentId);
};

const applySessionStatus = (sessionId: string, status: string): void => {
  const nextStatus = mapSessionStatus(status);
  sessionStore.setState((prev) => {
    let changed = false;
    const nextSessions = prev.sessions.map((s) => {
      if (s.id === sessionId && s.status !== nextStatus) {
        changed = true;
        return { ...s, status: nextStatus };
      }
      return s;
    });
    let nextBootstrap = prev.bootstrapActiveSession;
    if (nextBootstrap?.id === sessionId && nextBootstrap.status !== nextStatus) {
      changed = true;
      nextBootstrap = { ...nextBootstrap, status: nextStatus };
    }
    let nextSummary = prev.activeSessionSummary;
    if (nextSummary?.id === sessionId && nextSummary.status !== nextStatus) {
      changed = true;
      nextSummary = { ...nextSummary, status: nextStatus };
    }
    if (!changed) return prev;
    return {
      ...prev,
      sessions: nextSessions,
      bootstrapActiveSession: nextBootstrap,
      activeSessionSummary: nextSummary,
    };
  });
};

export const applyRestoredSession = (session: SessionWithState | null): void => {
  if (!session) {
    if (sessionStore.state.activeSessionId === null) {
      sessionStore.setState((prev) => ({ ...prev, activeSessionSummary: null }));
    }
    return;
  }

  const summary = mapToUIActiveSessionSummary(session);
  const lightweightSession = mapToUISession(session);
  upsertSessions([lightweightSession]);
  if (sessionStore.state.activeSessionId === session.id) {
    sessionStore.setState((prev) => ({
      ...prev,
      activeSessionSummary: summary,
      bootstrapActiveSession: lightweightSession,
    }));
    syncSelectedAgentToSession(session.id);
  } else {
    sessionStore.setState((prev) => ({ ...prev, activeSessionSummary: summary }));
  }
};

export const applyBootstrapShell = async (input: {
  activeSessionId: string | null;
  activeSession?: SessionListItem | null;
}): Promise<void> => {
  await ensureGroupModeLoaded();

  const previousActiveSessionId = sessionStore.state.activeSessionId;
  const nextActiveSessionId = input.activeSessionId ?? null;

  if (previousActiveSessionId && previousActiveSessionId !== nextActiveSessionId) {
    clearStreamingState();
  }

  setActiveSessionId(nextActiveSessionId);
  clearActiveSessionSummary();
  updateBootstrapActiveSession(input.activeSession ? mapToUISession(input.activeSession) : null);
  syncSelectedAgentToSession(nextActiveSessionId);
};

const loadSessionPage = async (options: {
  reset: boolean;
  preserveExisting?: boolean;
  prioritizeSessionId?: string | null;
}): Promise<void> => {
  if (options.reset) {
    const requestId = ++initialPageRequestId;
    sessionStore.setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      await ensureGroupModeLoaded();
      const result = await sessionClient.listLightweight({
        limit: DEFAULT_SESSION_PAGE_SIZE,
        cursor: null,
        includeSubagents: true,
        prioritizeSessionId: options.prioritizeSessionId ?? undefined,
      });

      if (requestId !== initialPageRequestId) {
        return;
      }

      const nextSessions = result.items.map(mapToUISession);
      sessionStore.setState((prev) => ({
        ...prev,
        sessions: options.preserveExisting ? mergeSessions(prev.sessions, nextSessions) : sortSessions(nextSessions),
        hasLoadedInitialPage: true,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      }));
      syncSelectedAgentToSession(sessionStore.state.activeSessionId);
    } catch (loadError) {
      sessionStore.setState((prev) => ({
        ...prev,
        error: `Failed to load sessions: ${loadError}`,
      }));
    } finally {
      if (requestId === initialPageRequestId) {
        sessionStore.setState((prev) => ({ ...prev, loading: false }));
      }
    }

    return;
  }

  const s = sessionStore.state;
  if (s.loadingMore || !s.hasMore || !s.nextCursor) {
    return;
  }

  const requestId = ++nextPageRequestId;
  sessionStore.setState((prev) => ({ ...prev, loadingMore: true, error: null }));

  try {
    const result = await sessionClient.listLightweight({
      limit: DEFAULT_SESSION_PAGE_SIZE,
      cursor: sessionStore.state.nextCursor,
      includeSubagents: true,
    });

    if (requestId !== nextPageRequestId) {
      return;
    }

    upsertSessions(result.items.map(mapToUISession));
    sessionStore.setState((prev) => ({
      ...prev,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    }));
    console.info(
      `[Startup][Renderer] startup.session.page.appended count=${result.items.length} total=${sessionStore.state.sessions.length}`,
    );
  } catch (loadError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to load more sessions: ${loadError}`,
    }));
  } finally {
    if (requestId === nextPageRequestId) {
      sessionStore.setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }
};

export async function fetchSessions(): Promise<void> {
  await loadSessionPage({
    reset: true,
    prioritizeSessionId: sessionStore.state.activeSessionId ?? sessionStore.state.bootstrapActiveSession?.id ?? null,
  });
}

export async function loadNextPage(): Promise<void> {
  await loadSessionPage({ reset: false });
}

export async function refreshSessionsByIds(sessionIds: string[]): Promise<void> {
  const normalizedIds = Array.from(new Set(sessionIds.map((sessionId) => sessionId.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) {
    await loadSessionPage({
      reset: true,
      preserveExisting: true,
      prioritizeSessionId: sessionStore.state.activeSessionId ?? sessionStore.state.bootstrapActiveSession?.id ?? null,
    });
    return;
  }

  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const items = await sessionClient.getLightweightByIds(normalizedIds);
    upsertSessions(items.map(mapToUISession));

    const activeId = sessionStore.state.activeSessionId;
    if (activeId) {
      const activeItem = items.find((item) => item.id === activeId);
      if (activeItem) {
        updateBootstrapActiveSession(mapToUISession(activeItem));
        syncSelectedAgentToSession(activeId);
      }
    }
  } catch (refreshError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to refresh sessions: ${refreshError}`,
    }));
  }
}

export async function createSession(input: CreateSessionInput): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const result = await sessionClient.create(input);
    const session = result.session;
    const lightweightSession = mapToUISession(session);
    upsertSessions([lightweightSession]);
    setActiveSessionId(session.id);
    sessionStore.setState((prev) => ({
      ...prev,
      bootstrapActiveSession: lightweightSession,
      activeSessionSummary: mapToUIActiveSessionSummary(session),
    }));
    syncSelectedAgentToSession(session.id);
    goToChat(session.id);
    await completeOnboardingStep("first-chat");
  } catch (createError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to create session: ${createError}`,
    }));
    throw createError;
  }
}

export async function selectSession(sessionId: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    if (sessionStore.state.activeSessionId && sessionStore.state.activeSessionId !== sessionId) {
      clearStreamingState();
    }
    await sessionClient.activate(sessionId);
    clearActiveSessionSummary();
    syncSelectedAgentToSession(sessionId);
    setActiveSessionId(sessionId);
    goToChat(sessionId);
  } catch (selectError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to select session: ${selectError}`,
    }));
  }
}

export async function closeSession(options: CloseSessionOptions = {}): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    clearStreamingState();
    await sessionClient.deactivate();
    clearActiveSessionSummary();
    setActiveSessionId(null);
    goToNewThread(options.refresh ? { refresh: true } : {});
  } catch (closeError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to close session: ${closeError}`,
    }));
  }
}

export async function startNewConversation(options: StartNewConversationOptions = {}): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));

  const targetAgentId = getNewConversationTargetAgentId();
  if (!targetAgentId) {
    return;
  }

  if (agentStore.state.selectedAgentId !== targetAgentId) {
    setSelectedAgent(targetAgentId);
  }

  if (getHasActiveSession()) {
    await closeSession({ refresh: options.refresh ?? true });
    return;
  }

  goToNewThread({ refresh: options.refresh ?? true });
}

async function completeOnboardingStep(stepId: GuidedOnboardingStepId): Promise<void> {
  try {
    const state = await onboardingClient.getState();

    if (state.status !== "active") {
      return;
    }

    const step = state.steps.find((candidate) => candidate.id === stepId);

    if (!step || step.status === "completed" || step.status === "skipped") {
      return;
    }

    const nextState = await onboardingClient.setStepStatus({
      stepId,
      status: "completed",
    });

    if (nextState.status === "active" && nextState.currentStepId === null) {
      await onboardingClient.complete();
    }

    const resumeIntent = readGuidedOnboardingResumeIntent();
    if (resumeIntent?.trigger === "step-completed" && resumeIntent.stepId === stepId) {
      requestGuidedOnboardingResume("step-completed");
    }
  } catch (completionError) {
    console.warn(`[SessionStore] Failed to complete onboarding step ${stepId}:`, completionError);
  }
}

export async function sendMessage(sessionId: string, content: string | SendMessageInput): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await chatClient.sendMessage(sessionId, content);
    await completeOnboardingStep("first-chat");
  } catch (sendError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to send message: ${sendError}`,
    }));
    throw sendError;
  }
}

export async function setSessionModel(sessionId: string, providerId: string, modelId: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.setSessionModel(sessionId, providerId, modelId);
    upsertSessions([mapToUISession(updated)]);
    if (sessionStore.state.activeSessionId === sessionId) {
      applyRestoredSession(updated);
    }
    await completeOnboardingStep("switch-model");
  } catch (updateError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to set session model: ${updateError}`,
    }));
    throw updateError;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.deleteSession(sessionId);
    removeSessions([sessionId]);
    if (sessionStore.state.activeSessionId === sessionId) {
      clearStreamingState();
      setActiveSessionId(null);
      goToNewThread();
    }
  } catch (deleteError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to delete session: ${deleteError}`,
    }));
  }
}

export async function setSessionSubagentEnabled(sessionId: string, enabled: boolean): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.setSessionSubagentEnabled(sessionId, enabled);
    upsertSessions([mapToUISession(updated)]);
    if (sessionStore.state.activeSessionId === sessionId) {
      applyRestoredSession(updated);
    }
  } catch (updateError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to update subagent state: ${updateError}`,
    }));
    throw updateError;
  }
}

export async function setSessionProjectDir(sessionId: string, projectDir: string | null): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.setSessionProjectDir(sessionId, projectDir);
    upsertSessions([mapToUISession(updated)]);
    if (sessionStore.state.activeSessionId === sessionId) {
      applyRestoredSession(updated);
    }
  } catch (updateError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to set session project directory: ${updateError}`,
    }));
    throw updateError;
  }
}

export async function moveSessionToAgent(sessionId: string, toAgentId: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.moveSessionToAgent(sessionId, toAgentId);
    upsertSessions([mapToUISession(updated)]);
    if (sessionStore.state.activeSessionId === sessionId) {
      applyRestoredSession(updated);
      syncSelectedAgentToSession(sessionId);
    }
  } catch (updateError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to move session: ${updateError}`,
    }));
    throw updateError;
  }
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const normalized = title.trim();
    if (!normalized) {
      return;
    }
    await sessionClient.renameSession(sessionId, normalized);
    sessionStore.setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, title: normalized } : s)),
      bootstrapActiveSession:
        prev.bootstrapActiveSession?.id === sessionId
          ? { ...prev.bootstrapActiveSession, title: normalized }
          : prev.bootstrapActiveSession,
      activeSessionSummary:
        prev.activeSessionSummary?.id === sessionId
          ? { ...prev.activeSessionSummary, title: normalized }
          : prev.activeSessionSummary,
    }));
  } catch (renameError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to rename session: ${renameError}`,
    }));
    throw renameError;
  }
}

export async function toggleSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.toggleSessionPinned(sessionId, pinned);
    sessionStore.setState((prev) => {
      const nextSessions = prev.sessions.map((s) => (s.id === sessionId ? { ...s, isPinned: pinned } : s));
      const nextBootstrap =
        prev.bootstrapActiveSession?.id === sessionId
          ? { ...prev.bootstrapActiveSession, isPinned: pinned }
          : prev.bootstrapActiveSession;
      const nextSummary =
        prev.activeSessionSummary?.id === sessionId
          ? { ...prev.activeSessionSummary, isPinned: pinned }
          : prev.activeSessionSummary;
      return {
        ...prev,
        sessions: sortSessions(nextSessions),
        bootstrapActiveSession: nextBootstrap,
        activeSessionSummary: nextSummary,
      };
    });
  } catch (pinError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to toggle pinned state: ${pinError}`,
    }));
    throw pinError;
  }
}

export async function clearSessionMessages(sessionId: string): Promise<void> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.clearSessionMessages(sessionId);
    if (sessionStore.state.activeSessionId === sessionId) {
      clearStreamingState();
      const restored = await loadMessages(sessionId);
      applyRestoredSession(restored);
    }
  } catch (clearError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to clear session messages: ${clearError}`,
    }));
    throw clearError;
  }
}

export async function exportSession(
  sessionId: string,
  format: "markdown" | "html" | "txt" | "nowledge-mem",
): Promise<{ filename: string; content: string }> {
  sessionStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const result = await sessionClient.exportSession(sessionId, format);
    const blob = new Blob([result.content], {
      type: getContentType(format),
    });
    downloadBlob(blob, result.filename);
    return result;
  } catch (exportError) {
    sessionStore.setState((prev) => ({
      ...prev,
      error: `Failed to export session: ${exportError}`,
    }));
    throw exportError;
  }
}

export async function toggleGroupMode(): Promise<void> {
  const previousMode = sessionStore.state.groupMode;
  const nextMode = previousMode === "time" ? "project" : "time";
  const localVersion = ++groupModeUpdateVersion;
  sessionStore.setState((prev) => ({ ...prev, groupMode: nextMode }));

  groupModeWritePromise = groupModeWritePromise.then(async () => {
    try {
      await configClient.setSetting(SIDEBAR_GROUP_MODE_KEY, sessionStore.state.groupMode);
      if (localVersion !== groupModeUpdateVersion) {
        return;
      }
    } catch (persistError) {
      if (localVersion === groupModeUpdateVersion) {
        sessionStore.setState((prev) => ({ ...prev, groupMode: previousMode }));
      }
      console.warn("[sessionStore] Failed to persist sidebar group mode:", persistError);
    }
  });

  await groupModeWritePromise;
}

export function getPinnedSessions(agentId: string | null): UISession[] {
  const pinned = sortSessions(
    sessionStore.state.sessions.filter((session) => isRegularSession(session) && session.isPinned && !session.isDraft),
  );

  if (agentId === null) return pinned;

  return pinned.filter((session) => session.agentId === agentId);
}

export function getFilteredGroups(agentId: string | null): SessionGroup[] {
  const visibleSessions = sortSessions(
    sessionStore.state.sessions.filter((session) => isRegularSession(session) && !session.isDraft && !session.isPinned),
  );
  const grouped =
    sessionStore.state.groupMode === "time" ? groupByTime(visibleSessions) : groupByProject(visibleSessions);

  if (agentId === null) return grouped;

  return grouped
    .map((group) => ({
      id: group.id,
      label: group.label,
      labelKey: group.labelKey,
      sessions: group.sessions.filter((session) => session.agentId === agentId),
    }))
    .filter((group) => group.sessions.length > 0);
}

const cleanupIpcBindings = bindSessionStoreIpc({
  webContentsId: myWebContentsId,
  fetchSessions,
  refreshSessionsByIds,
  removeSessions,
  onActivated: (sessionId) => {
    if (sessionStore.state.activeSessionId && sessionStore.state.activeSessionId !== sessionId) {
      clearStreamingState();
    }
    clearActiveSessionSummary();
    syncSelectedAgentToSession(sessionId);
    setActiveSessionId(sessionId);
    goToChat(sessionId);
    void tabClient.notifyRendererActivated(sessionId);
  },
  onDeactivated: () => {
    clearStreamingState();
    clearActiveSessionSummary();
    setActiveSessionId(null);
    goToNewThread();
  },
  onStatusChanged: (sessionId, status) => {
    applySessionStatus(sessionId, status);
  },
});

export function cleanupSessionStore(): void {
  cleanupIpcBindings();
}

void ensureGroupModeLoaded();

export function useSessionStore() {
  const state = useStore(sessionStore);
  return {
    ...state,
    getState: () => sessionStore.state,
    fetchSessions,
    loadNextPage,
    refreshSessionsByIds,
    createSession,
    selectSession,
    closeSession,
    startNewConversation,
    sendMessage,
    setSessionModel,
    deleteSession,
    setSessionSubagentEnabled,
    setSessionProjectDir,
    moveSessionToAgent,
    renameSession,
    toggleSessionPinned,
    clearSessionMessages,
    exportSession,
    toggleGroupMode,
    getPinnedSessions,
    getFilteredGroups,
    getActiveSession,
    getHasActiveSession,
    applyBootstrapShell,
    applyRestoredSession,
  };
}
