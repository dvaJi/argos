export interface SettingsNavigationItem {
  routeName:
    | "settings-overview"
    | "settings-common"
    | "settings-display"
    | "settings-environments"
    | "settings-provider"
    | "settings-dashboard"
    | "settings-mcp"
    | "settings-argos-agents"
    | "settings-acp"
    | "settings-remote"
    | "settings-server"
    | "settings-notifications-hooks"
    | "settings-scheduled-tasks"
    | "settings-plugins"
    | "settings-skills"
    | "settings-prompt"
    | "settings-knowledge-base"
    | "settings-database"
    | "settings-shortcut"
    | "settings-about";
  path: string;
  titleKey: string;
  icon: string;
  position: number;
  groupKey: SettingsNavigationGroupKey;
  keywords: string[];
  supportedPlatforms?: string[];
  supportedTargets?: string[];
  hiddenInSidebar?: boolean;
}

export type SettingsNavigationGroupKey = "overview" | "setup" | "models" | "tools" | "knowledge" | "system";

export interface SettingsNavigationGroup {
  key: SettingsNavigationGroupKey;
  titleKey: string;
  position: number;
  items: SettingsNavigationItem[];
}

export interface SettingsNavigationPayload {
  routeName: SettingsNavigationItem["routeName"];
  params?: Record<string, string>;
  section?: string;
}

export const SETTINGS_NAVIGATION_GROUPS: Array<Omit<SettingsNavigationGroup, "items">> = [
  {
    key: "overview",
    titleKey: "settings.controlCenter.groups.overview",
    position: 0,
  },
  {
    key: "setup",
    titleKey: "settings.controlCenter.groups.setup",
    position: 1,
  },
  {
    key: "models",
    titleKey: "settings.controlCenter.groups.models",
    position: 2,
  },
  {
    key: "tools",
    titleKey: "settings.controlCenter.groups.tools",
    position: 3,
  },
  {
    key: "knowledge",
    titleKey: "settings.controlCenter.groups.knowledge",
    position: 4,
  },
  {
    key: "system",
    titleKey: "settings.controlCenter.groups.system",
    position: 5,
  },
];

export const SETTINGS_NAVIGATION_ITEMS: SettingsNavigationItem[] = [
  {
    routeName: "settings-overview",
    path: "/overview",
    titleKey: "routes.settings-overview",
    icon: "lucide:gauge",
    position: 0,
    groupKey: "overview",
    keywords: ["overview", "dashboard", "usage", "settings"],
  },
  {
    routeName: "settings-common",
    path: "/common",
    titleKey: "routes.settings-common",
    icon: "lucide:bolt",
    position: 1,
    groupKey: "setup",
    keywords: ["common", "general", "preferences"],
  },
  {
    routeName: "settings-display",
    path: "/display",
    titleKey: "routes.settings-display",
    icon: "lucide:monitor",
    position: 2,
    groupKey: "setup",
    keywords: ["display", "theme", "font", "appearance"],
  },
  {
    routeName: "settings-environments",
    path: "/environments",
    titleKey: "routes.settings-environments",
    icon: "lucide:folders",
    position: 3.25,
    groupKey: "models",
    keywords: ["environment", "workspace", "folder", "project"],
  },
  {
    routeName: "settings-provider",
    path: "/provider/:providerId?",
    titleKey: "routes.settings-provider",
    icon: "lucide:cloud-cog",
    position: 3,
    groupKey: "models",
    keywords: ["provider", "model", "llm", "openai", "anthropic"],
  },
  {
    routeName: "settings-argos-agents",
    path: "/argos-agents",
    titleKey: "routes.settings-argos-agents",
    icon: "lucide:bot",
    position: 3.5,
    groupKey: "models",
    keywords: ["agent", "agents", "argos", "agent"],
  },
  {
    routeName: "settings-acp",
    path: "/acp",
    titleKey: "routes.settings-acp",
    icon: "lucide:shield-check",
    position: 4,
    groupKey: "models",
    keywords: ["acp", "agent client protocol"],
  },
  {
    routeName: "settings-dashboard",
    path: "/dashboard",
    titleKey: "routes.settings-dashboard",
    icon: "lucide:layout-dashboard",
    position: 4.5,
    groupKey: "overview",
    keywords: ["dashboard", "usage", "stats"],
    hiddenInSidebar: true,
  },
  {
    routeName: "settings-mcp",
    path: "/mcp",
    titleKey: "routes.settings-mcp",
    icon: "lucide:server",
    position: 5,
    groupKey: "tools",
    keywords: ["mcp", "tools", "server", "model context protocol"],
  },
  {
    routeName: "settings-server",
    path: "/server",
    titleKey: "routes.settings-server",
    icon: "lucide:server",
    position: 5.2,
    groupKey: "system",
    keywords: ["server", "daemon", "remote", "tailscale", "connect"],
  },
  {
    routeName: "settings-remote",
    path: "/remote",
    titleKey: "routes.settings-remote",
    icon: "lucide:smartphone",
    position: 5.25,
    groupKey: "system",
    keywords: ["remote", "telegram", "control"],
  },
  {
    routeName: "settings-notifications-hooks",
    path: "/notifications-hooks",
    titleKey: "routes.settings-notifications-hooks",
    icon: "lucide:bell",
    position: 5.5,
    groupKey: "tools",
    keywords: ["notification", "hook", "webhook"],
  },
  {
    routeName: "settings-scheduled-tasks",
    path: "/scheduled-tasks",
    titleKey: "routes.settings-scheduled-tasks",
    icon: "lucide:clock-9",
    position: 5.6,
    groupKey: "tools",
    keywords: ["schedule", "scheduled", "reminder", "timer", "cron"],
  },
  {
    routeName: "settings-plugins",
    path: "/plugins",
    titleKey: "routes.settings-plugins",
    icon: "lucide:puzzle",
    position: 5.75,
    groupKey: "tools",
    keywords: ["plugin", "plugins", "extension", "runtime"],
    supportedTargets: ["darwin/arm64", "darwin/x64", "win32/x64", "win32/arm64", "linux/x64"],
  },
  {
    routeName: "settings-skills",
    path: "/skills",
    titleKey: "routes.settings-skills",
    icon: "lucide:wand-sparkles",
    position: 6,
    groupKey: "knowledge",
    keywords: ["skill", "skills"],
  },
  {
    routeName: "settings-prompt",
    path: "/prompt",
    titleKey: "routes.settings-prompt",
    icon: "lucide:book-open-text",
    position: 7,
    groupKey: "knowledge",
    keywords: ["prompt", "system prompt"],
  },
  {
    routeName: "settings-knowledge-base",
    path: "/knowledge-base",
    titleKey: "routes.settings-knowledge-base",
    icon: "lucide:book-marked",
    position: 8,
    groupKey: "knowledge",
    keywords: ["knowledge", "rag", "knowledge base"],
  },
  {
    routeName: "settings-database",
    path: "/database",
    titleKey: "routes.settings-database",
    icon: "lucide:database",
    position: 9,
    groupKey: "system",
    keywords: ["database", "data", "backup"],
  },
  {
    routeName: "settings-shortcut",
    path: "/shortcut",
    titleKey: "routes.settings-shortcut",
    icon: "lucide:keyboard",
    position: 10,
    groupKey: "system",
    keywords: ["shortcut", "hotkey", "keybinding"],
  },
  {
    routeName: "settings-about",
    path: "/about",
    titleKey: "routes.settings-about",
    icon: "lucide:info",
    position: 11,
    groupKey: "system",
    keywords: ["about", "version", "info"],
  },
];

const getPlatformAliases = (platform?: string): Set<string> => {
  const normalized = platform?.trim().toLowerCase();
  if (!normalized) {
    return new Set();
  }

  if (["darwin", "macos", "mac"].includes(normalized)) {
    return new Set(["darwin", "macos", "mac"]);
  }
  if (["win32", "windows", "win"].includes(normalized)) {
    return new Set(["win32", "windows", "win"]);
  }

  return new Set([normalized]);
};

export const isSettingsNavigationItemSupported = (
  item: SettingsNavigationItem,
  platform?: string,
  arch?: string,
): boolean => {
  if (item.supportedTargets?.length) {
    const targets = item.supportedTargets.map((target) => target.trim().toLowerCase());
    if (!platform) {
      // No platform context: can't filter, keep the item visible.
      return true;
    }
    const aliases = getPlatformAliases(platform);
    if (!arch) {
      // Legacy platform-only call: match on platform alone (any arch) so
      // unsupported platforms are still filtered out.
      return [...aliases].some((platformAlias) => targets.some((target) => target.startsWith(`${platformAlias}/`)));
    }
    const normalizedArch = arch.trim().toLowerCase();
    return [...aliases].some((platformAlias) => targets.includes(`${platformAlias}/${normalizedArch}`));
  }

  if (!item.supportedPlatforms?.length) {
    return true;
  }
  if (!platform) {
    return true;
  }

  const aliases = getPlatformAliases(platform);
  return item.supportedPlatforms.some((supportedPlatform) => aliases.has(supportedPlatform.trim().toLowerCase()));
};

export const getSettingsRouteItems = (platform?: string, arch?: string): SettingsNavigationItem[] =>
  SETTINGS_NAVIGATION_ITEMS.filter((item) => isSettingsNavigationItemSupported(item, platform, arch));

export const getSettingsNavigationItems = (platform?: string, arch?: string): SettingsNavigationItem[] =>
  getSettingsRouteItems(platform, arch).filter((item) => !item.hiddenInSidebar);

export const getSettingsNavigationGroups = (platform?: string, arch?: string): SettingsNavigationGroup[] => {
  const items = getSettingsNavigationItems(platform, arch);

  return SETTINGS_NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.groupKey === group.key).sort((left, right) => left.position - right.position),
  })).filter((group) => group.items.length > 0);
};

const TITLE_MAP: Record<string, string> = {
  "settings.controlCenter.groups.overview": "Overview",
  "settings.controlCenter.groups.setup": "Setup",
  "settings.controlCenter.groups.models": "Agent Settings",
  "settings.controlCenter.groups.tools": "Capability Extensions",
  "settings.controlCenter.groups.knowledge": "Knowledge",
  "settings.controlCenter.groups.system": "System",
  "routes.settings-overview": "Settings Overview",
  "routes.settings-common": "Common Settings",
  "routes.settings-display": "Display",
  "routes.settings-environments": "Environments",
  "routes.settings-provider": "Providers",
  "routes.settings-mcp": "MCP Settings",
  "routes.settings-argos-agents": "Argos Agents",
  "routes.settings-acp": "ACP Agents",
  "routes.settings-server": "Server",
  "routes.settings-remote": "Remote",
  "routes.settings-notifications-hooks": "Hooks",
  "routes.settings-scheduled-tasks": "Scheduled Tasks",
  "routes.settings-plugins": "Plugins",
  "routes.settings-skills": "Skills",
  "routes.settings-prompt": "Prompts",
  "routes.settings-knowledge-base": "Knowledge Base",
  "routes.settings-database": "Data",
  "routes.settings-shortcut": "Shortcuts",
  "routes.settings-about": "About",
  "routes.settings-dashboard": "Dashboard",
  "settings.overview.title": "Overview",
  "settings.overview.description": "Your settings at a glance",
  "settings.overview.searchPlaceholder": "Search settings...",
  "settings.overview.quickStart": "Quick Start",
  "settings.overview.quickTasks.addApiKey": "Add API Key",
  "settings.overview.quickTasks.enableModel": "Enable Model",
  "settings.overview.quickTasks.startMcpServer": "Start MCP Server",
  "settings.overview.quickTasks.backupNow": "Backup Now",
  "settings.overview.metrics.providers": "Providers",
  "settings.overview.metrics.providersDescription": "AI model providers",
  "settings.overview.metrics.mcp": "MCP",
  "settings.overview.metrics.mcpEnabled": "MCP is enabled",
  "settings.overview.metrics.mcpDisabled": "MCP is disabled",
  "settings.overview.metrics.argosAgents": "Argos Agents",
  "settings.overview.metrics.argosAgentsDescription": "Built-in agents",
  "settings.overview.metrics.enabled": "enabled",
  "settings.overview.metrics.running": "running",
  "settings.overview.activity.title": "Recent Activity",
  "settings.overview.activity.description": "Recent changes to your settings",
  "settings.overview.activity.when": "When",
  "settings.overview.activity.category": "Category",
  "settings.overview.activity.change": "Change",
  "settings.overview.activity.emptyTitle": "No recent activity",
  "settings.overview.activity.emptyDescription": "Changes you make to settings will appear here.",
  "settings.overview.categories.provider": "Providers",
  "settings.overview.categories.model": "Models",
  "settings.overview.categories.mcp": "MCP",
  "settings.overview.categories.privacy": "Privacy Mode",
  "settings.overview.categories.appearance": "Display",
  "settings.overview.categories.agent": "Models",
  "settings.overview.categories.knowledge": "Knowledge",
  "settings.overview.categories.prompt": "Prompt",
  "settings.overview.categories.shortcut": "Shortcuts",
  "settings.overview.categories.data": "Data & Privacy",
  "settings.overview.categories.system": "System",
};

export const resolveTitle = (titleKey: string): string => TITLE_MAP[titleKey] ?? titleKey;

export const resolveSettingsNavigationPath = (
  routeName: SettingsNavigationItem["routeName"],
  params?: Record<string, string>,
  platform?: string,
  arch?: string,
): string => {
  const item = getSettingsRouteItems(platform, arch).find((navigationItem) => navigationItem.routeName === routeName);
  if (!item) {
    return "/overview";
  }

  const resolvedSegments = item.path
    .split("/")
    .filter((segment) => segment.length > 0)
    .flatMap((segment) => {
      if (!segment.startsWith(":")) {
        return [segment];
      }

      const key = segment.slice(1).replace(/\?$/, "");
      const value = params?.[key]?.trim();
      if (value) {
        return [encodeURIComponent(value)];
      }

      return segment.endsWith("?") ? [] : [key];
    });
  return `/${resolvedSegments.join("/")}`;
};
