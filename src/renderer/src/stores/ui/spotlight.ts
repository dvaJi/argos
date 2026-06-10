import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createSettingsClient } from "@api/SettingsClient";
import { createSessionClient } from "@api/SessionClient";
import { enabledAgents } from "./agent";
import { goToNewThread } from "./pageRouter";
import { setSelectedAgent } from "./agent";
import { SETTINGS_NAVIGATION_ITEMS, type SettingsNavigationItem } from "@shared/settingsNavigation";
import type { HistorySearchHit } from "@shared/presenter";

type SpotlightItemKind = "session" | "message" | "agent" | "setting" | "action";
type SpotlightActionId =
  | "new-chat"
  | "open-settings"
  | "open-providers"
  | "open-agents"
  | "open-mcp"
  | "open-shortcuts"
  | "open-remote";

export interface SpotlightItem {
  id: string;
  kind: SpotlightItemKind;
  icon: string;
  title?: string;
  titleKey?: string;
  subtitle?: string;
  snippet?: string;
  score: number;
  updatedAt?: number;
  sessionId?: string;
  messageId?: string;
  routeName?: SettingsNavigationItem["routeName"];
  routeParams?: Record<string, string>;
  actionId?: SpotlightActionId;
  agentId?: string | null;
  keywords?: string[];
}

const MAX_RESULTS = 12;
const SEARCH_DEBOUNCE_DELAY = 80;
const normalizeQuery = (value: string): string => value.trim().toLowerCase();

const scoreTextMatch = (query: string, ...parts: Array<string | null | undefined>): number => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return 0;

  const values = parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.toLowerCase());

  for (const value of values) {
    if (value.startsWith(normalizedQuery)) return 320;
  }

  for (const value of values) {
    if (value.includes(normalizedQuery)) return 220;
  }

  return 0;
};

const actionItems: Array<{
  id: SpotlightActionId;
  titleKey: string;
  routeName?: SettingsNavigationItem["routeName"];
  icon: string;
  keywords: string[];
}> = [
  {
    id: "new-chat",
    titleKey: "common.newChat",
    icon: "lucide:square-pen",
    keywords: ["new", "chat", "conversation", "新建", "会话"],
  },
  {
    id: "open-settings",
    titleKey: "routes.settings",
    icon: "lucide:settings-2",
    keywords: ["settings", "preferences", "设置"],
  },
  {
    id: "open-providers",
    titleKey: "routes.settings-provider",
    routeName: "settings-provider",
    icon: "lucide:cloud-cog",
    keywords: ["providers", "models", "llm", "服务商", "模型"],
  },
  {
    id: "open-agents",
    titleKey: "routes.settings-deepchat-agents",
    routeName: "settings-deepchat-agents",
    icon: "lucide:bot",
    keywords: ["agents", "deepchat", "智能体", "agent"],
  },
  {
    id: "open-mcp",
    titleKey: "routes.settings-mcp",
    routeName: "settings-mcp",
    icon: "lucide:server",
    keywords: ["mcp", "tools", "server", "工具"],
  },
  {
    id: "open-shortcuts",
    titleKey: "routes.settings-shortcut",
    routeName: "settings-shortcut",
    icon: "lucide:keyboard",
    keywords: ["shortcut", "hotkey", "keybinding", "快捷键"],
  },
  {
    id: "open-remote",
    titleKey: "routes.settings-remote",
    routeName: "settings-remote",
    icon: "lucide:smartphone",
    keywords: ["remote", "telegram", "feishu", "远程"],
  },
];

export interface SpotlightExternalStore {
  getSessions: () => Array<{
    id: string;
    title: string;
    projectDir: string;
    updatedAt: number;
    sessionKind: string;
  }>;
  getSortedProviders: () => Array<{
    id: string;
    name: string;
    apiType: string;
    baseUrl: string;
    enable: boolean;
  }>;
  hasActiveSession: () => boolean;
  selectSession: (id: string) => Promise<void>;
  closeSession: () => Promise<void>;
  startNewConversation: (opts: { refresh: boolean }) => Promise<void>;
}

let external: SpotlightExternalStore | undefined;

export function connectSpotlightExternal(store: SpotlightExternalStore) {
  external = store;
}

const sessionClient = createSessionClient();
const settingsClient = createSettingsClient();

export const spotlightStore = new Store({
  open: false,
  activationKey: 0,
  query: "",
  results: [] as SpotlightItem[],
  activeIndex: 0,
  loading: false,
  requestSeq: 0,
  pendingMessageJump: null as { sessionId: string; messageId: string } | null,
});

export const hasResults = () => spotlightStore.state.results.length > 0;

const buildRecentSessionItems = (): SpotlightItem[] =>
  !external
    ? []
    : [...external.getSessions()]
        .filter((session) => session.sessionKind !== "subagent")
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 5)
        .map((session) => ({
          id: `session:${session.id}`,
          kind: "session" as const,
          icon: "lucide:message-square",
          title: session.title,
          subtitle: session.projectDir || "",
          sessionId: session.id,
          score: 0,
          updatedAt: session.updatedAt,
        }));

const buildAgentItems = (): SpotlightItem[] =>
  enabledAgents().map((agent) => ({
    id: `agent:${agent.id}`,
    kind: "agent" as const,
    icon: "lucide:bot",
    title: agent.name,
    agentId: agent.id,
    score: 0,
    keywords: [agent.type, agent.agentType, agent.description].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  }));

const buildActionItems = (): SpotlightItem[] =>
  actionItems.map((action) => ({
    id: `action:${action.id}`,
    kind: "action" as const,
    icon: action.icon,
    titleKey: action.titleKey,
    actionId: action.id,
    routeName: action.routeName,
    score: 0,
    keywords: action.keywords,
  }));

const buildDefaultResults = (): SpotlightItem[] =>
  [...buildRecentSessionItems(), ...buildAgentItems().slice(0, 3), ...buildActionItems()]
    .slice(0, MAX_RESULTS)
    .map((item, index) => ({ ...item, score: MAX_RESULTS - index }));

const toHistoryItem = (hit: HistorySearchHit, normalizedQuery: string): SpotlightItem => {
  if (hit.kind === "session") {
    return {
      id: `session:${hit.sessionId}`,
      kind: "session",
      icon: "lucide:message-square",
      title: hit.title,
      subtitle: hit.projectDir || "",
      sessionId: hit.sessionId,
      updatedAt: hit.updatedAt,
      score: scoreTextMatch(normalizedQuery, hit.title) + 40,
    };
  }

  const titleScore = scoreTextMatch(normalizedQuery, hit.title);
  const snippetScore = scoreTextMatch(normalizedQuery, hit.snippet);

  return {
    id: `message:${hit.messageId}`,
    kind: "message",
    icon: "lucide:align-left",
    title: hit.title,
    snippet: hit.snippet,
    sessionId: hit.sessionId,
    messageId: hit.messageId,
    updatedAt: hit.updatedAt,
    score: Math.max(titleScore, snippetScore) + 10,
  };
};

const buildProviderMatches = (normalizedQuery: string): SpotlightItem[] =>
  !external
    ? []
    : external
        .getSortedProviders()
        .filter((provider) => provider.id !== "acp")
        .map((provider) => ({
          id: `setting:provider:${provider.id}`,
          kind: "setting" as const,
          icon: "lucide:cloud-cog",
          title: provider.name,
          subtitle: provider.apiType,
          routeName: "settings-provider" as const,
          routeParams: { providerId: provider.id },
          keywords: [provider.id, provider.apiType, provider.baseUrl].filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          ),
          score: scoreTextMatch(normalizedQuery, provider.name, provider.id, provider.apiType, provider.baseUrl),
        }))
        .filter((item) => item.score > 0);

const buildSettingMatches = (normalizedQuery: string): SpotlightItem[] =>
  SETTINGS_NAVIGATION_ITEMS.filter((item) => item.routeName !== "settings-provider")
    .map((item) => ({
      id: `setting:${item.routeName}`,
      kind: "setting" as const,
      icon: item.icon,
      titleKey: item.titleKey,
      routeName: item.routeName,
      keywords: item.keywords,
      score: scoreTextMatch(normalizedQuery, item.routeName, item.path, ...item.keywords),
    }))
    .filter((item) => item.score > 0);

const buildAgentMatches = (normalizedQuery: string): SpotlightItem[] =>
  buildAgentItems()
    .map((item) => ({
      ...item,
      score: scoreTextMatch(normalizedQuery, item.title, ...(item.keywords ?? [])),
    }))
    .filter((item) => item.score > 0);

const buildActionMatches = (normalizedQuery: string): SpotlightItem[] =>
  buildActionItems()
    .map((item) => ({
      ...item,
      score: scoreTextMatch(normalizedQuery, item.titleKey, ...(item.keywords ?? [])),
    }))
    .filter((item) => item.score > 0);

const sortResults = (items: SpotlightItem[]) =>
  [...items]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
    })
    .slice(0, MAX_RESULTS);

const resetActiveIndex = () => {
  spotlightStore.setState((prev) => ({
    ...prev,
    activeIndex: prev.results.length > 0 ? 0 : -1,
  }));
};

function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

const runSearch = debounce(
  (async (rawQuery: string, seq: number): Promise<void> => {
    const normalizedQuery = normalizeQuery(rawQuery);
    if (!normalizedQuery) {
      spotlightStore.setState((prev) => ({ ...prev, loading: false, results: buildDefaultResults() }));
      resetActiveIndex();
      return;
    }

    const historyHits = await sessionClient.searchHistory(normalizedQuery, {
      limit: MAX_RESULTS,
    });

    if (seq !== spotlightStore.state.requestSeq) return;

    spotlightStore.setState((prev) => ({
      ...prev,
      loading: false,
      results: sortResults([
        ...historyHits.filter((hit) => hit.kind === "session").map((hit) => toHistoryItem(hit, normalizedQuery)),
        ...buildAgentMatches(normalizedQuery),
        ...buildProviderMatches(normalizedQuery),
        ...buildSettingMatches(normalizedQuery),
        ...buildActionMatches(normalizedQuery),
      ]),
    }));
    resetActiveIndex();
  }) as unknown as (...args: unknown[]) => unknown,
  SEARCH_DEBOUNCE_DELAY,
);

const navigateToSettings = async (
  routeName?: SettingsNavigationItem["routeName"],
  routeParams?: Record<string, string>,
) => {
  if (!routeName) return;
  await settingsClient.openSettings(routeParams ? { routeName, params: routeParams } : { routeName });
};

const refreshOpenResults = (currentQuery: string) => {
  const normalizedQuery = normalizeQuery(currentQuery);
  if (!normalizedQuery) {
    spotlightStore.setState((prev) => ({
      ...prev,
      loading: false,
      requestSeq: prev.requestSeq + 1,
      results: buildDefaultResults(),
    }));
    resetActiveIndex();
    return;
  }

  spotlightStore.setState((prev) => ({ ...prev, loading: true }));
  const seq = spotlightStore.state.requestSeq + 1;
  spotlightStore.setState((prev) => ({ ...prev, requestSeq: seq }));
  void runSearch(currentQuery, seq);
};

export const setQuery = (value: string) => {
  spotlightStore.setState((prev) => ({ ...prev, query: value }));
  if (!spotlightStore.state.open) return;
  refreshOpenResults(value);
};

export const setOpen = (value: boolean) => {
  if (value) {
    spotlightStore.setState((prev) => ({
      ...prev,
      open: true,
      activationKey: prev.activationKey + 1,
    }));
    setQuery(spotlightStore.state.query);
    return;
  }

  spotlightStore.setState((prev) => ({
    ...prev,
    open: false,
    requestSeq: prev.requestSeq + 1,
    query: "",
    loading: false,
    results: [],
    activeIndex: 0,
  }));
};

export const openSpotlight = () => setOpen(true);

export const closeSpotlight = () => setOpen(false);

export const toggleSpotlight = () => {
  if (spotlightStore.state.open) {
    closeSpotlight();
    return;
  }
  openSpotlight();
};

export const setActiveItem = (index: number) => {
  const { results } = spotlightStore.state;
  if (results.length === 0) {
    spotlightStore.setState((prev) => ({ ...prev, activeIndex: -1 }));
    return;
  }
  spotlightStore.setState((prev) => ({
    ...prev,
    activeIndex: Math.min(Math.max(index, 0), prev.results.length - 1),
  }));
};

export const moveActiveItem = (delta: number) => {
  const { results, activeIndex } = spotlightStore.state;
  if (results.length === 0) {
    spotlightStore.setState((prev) => ({ ...prev, activeIndex: -1 }));
    return;
  }

  const currentIndex = activeIndex < 0 ? 0 : activeIndex;
  const nextIndex = (((currentIndex + delta) % results.length) + results.length) % results.length;
  spotlightStore.setState((prev) => ({ ...prev, activeIndex: nextIndex }));
};

export const executeItem = async (item: SpotlightItem | undefined) => {
  if (!item) return;

  closeSpotlight();

  if (item.kind === "session" && item.sessionId) {
    await external?.selectSession(item.sessionId);
    return;
  }

  if (item.kind === "message" && item.sessionId && item.messageId) {
    spotlightStore.setState((prev) => ({
      ...prev,
      pendingMessageJump: { sessionId: item.sessionId!, messageId: item.messageId! },
    }));
    await external?.selectSession(item.sessionId);
    return;
  }

  if (item.kind === "agent") {
    if (external?.hasActiveSession()) {
      await external?.closeSession();
    } else {
      goToNewThread();
    }
    setSelectedAgent(item.agentId ?? null);
    return;
  }

  if (item.kind === "setting") {
    await navigateToSettings(item.routeName, item.routeParams);
    return;
  }

  switch (item.actionId) {
    case "new-chat":
      await external?.startNewConversation({ refresh: true });
      return;
    case "open-settings":
      await settingsClient.openSettings();
      return;
    case "open-providers":
    case "open-agents":
    case "open-mcp":
    case "open-shortcuts":
    case "open-remote":
      await navigateToSettings(item.routeName);
      return;
    default:
      return;
  }
};

export const executeActiveItem = async () => {
  const { activeIndex, results } = spotlightStore.state;
  if (activeIndex < 0) return;
  await executeItem(results[activeIndex]);
};

export const clearPendingMessageJump = () => {
  spotlightStore.setState((prev) => ({ ...prev, pendingMessageJump: null }));
};

export function useSpotlightStore() {
  const state = useStore(spotlightStore);
  return {
    ...state,
    connectSpotlightExternal,
    hasResults,
    setQuery,
    openSpotlight,
    closeSpotlight,
    toggleSpotlight,
    setActiveItem,
    moveActiveItem,
    executeItem,
    executeActiveItem,
    clearPendingMessageJump,
  };
}
