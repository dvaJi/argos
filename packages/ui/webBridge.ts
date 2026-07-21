/**
 * Web-compatible IPC shim that routes legacy presenter calls
 * to the daemon's HTTP API (`POST /api/v1/route`).
 *
 * When running in the browser (daemon-served web UI), `window.electron`
 * and `window.api` don't exist. This module creates shims that intercept
 * `ipcRenderer.invoke("presenter:call", ...)` and forward to the daemon.
 */

const DAEMON_URL = "http://127.0.0.1:9527";

/**
 * Config entry keys the daemon actually persists (see CONFIG_ENTRY_KEYS in
 * shared-contracts). `configPresenter.getSetting/setSetting` are generic over
 * any string key, but the daemon's Zod enum rejects unknown keys. Settings that
 * only exist on desktop (e.g. maxFileSize) are treated as no-ops in web mode.
 */
const DAEMON_CONFIG_KEYS = new Set([
  "init_complete",
  "preferredModel",
  "defaultModel",
  "default_system_prompt",
  "input_deepThinking",
  "input_chatMode",
  "think_collapse",
  "artifact_think_collapse",
  "providerOrder",
  "providerTimestamps",
  "sidebar_group_mode",
  "input_enabledMcpTools",
]);

/** Empty usage dashboard returned in web mode (no usage stats backend). */
const EMPTY_USAGE_DASHBOARD = {
  recordingStartedAt: null,
  backfillStatus: { status: "idle", startedAt: null, finishedAt: null, error: null, updatedAt: Date.now() },
  summary: {
    messageCount: 0,
    sessionCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    cacheHitRate: 0,
    estimatedCostUsd: null,
    mostActiveDay: { date: null, messageCount: 0 },
  },
  calendar: [],
  providerBreakdown: [],
  modelBreakdown: [],
};

// ── Presenter → daemon route mapping ──────────────────────────────────

type PresenterMethodEntry = {
  route: string;
  /** Transform presenter args → daemon route input. Defaults to identity. */
  mapInput?: any;
  /** Transform daemon route output → legacy presenter return value. */
  mapOutput?: (output: unknown) => unknown;
};

const ROUTE_MAP: Record<string, Record<string, PresenterMethodEntry>> = {
  llmproviderPresenter: {
    listProviders: { route: "providers.list" },
    listSummaries: { route: "providers.listSummaries" },
    addProvider: { route: "providers.add", mapInput: (cfg: unknown) => ({ config: cfg }) },
    updateProvider: { route: "providers.update", mapInput: (id: string, cfg: unknown) => ({ id, config: cfg }) },
    removeProvider: { route: "providers.remove", mapInput: (id: string) => ({ id }) },
    testConnection: { route: "providers.testConnection", mapInput: (id: string) => ({ providerId: id }) },
    refreshModels: { route: "providers.refreshModels", mapInput: (id: string) => ({ providerId: id }) },
    getRateLimitStatus: { route: "providers.getRateLimitStatus", mapInput: (id: string) => ({ providerId: id }) },
    getProviderRateLimitStatus: {
      route: "providers.getRateLimitStatus",
      mapInput: (id: string) => ({ providerId: id }),
    },
    updateProviderRateLimit: {
      route: "providers.update",
      mapInput: (providerId: string, enabled: boolean, qpsLimit: number) => ({
        providerId,
        updates: {
          rateLimit: {
            enabled,
            qpsLimit,
          },
        },
      }),
      mapOutput: () => undefined,
    },
    setById: { route: "providers.setById", mapInput: (id: string, cfg: unknown) => ({ id, config: cfg }) },
    reorder: { route: "providers.reorder", mapInput: (ids: unknown) => ({ orderedIds: ids }) },
    importScan: { route: "providers.importScan" },
    importApply: { route: "providers.importApply", mapInput: (data: unknown) => ({ data }) },
  },
  configPresenter: {
    getEntries: { route: "config.getEntries", mapInput: (keys: unknown) => ({ keys }) },
    updateEntries: { route: "config.updateEntries", mapInput: (entries: unknown) => ({ entries }) },
    getSetting: { route: "config.getEntries", mapInput: (key: string) => ({ keys: [key] }) },
    setSetting: {
      route: "config.updateEntries",
      mapInput: (key: string, value: unknown) => ({ entries: { [key]: value } }),
    },
    getLanguage: { route: "config.getLanguage" },
    setLanguage: { route: "config.setLanguage", mapInput: (lang: unknown) => ({ language: lang }) },
    getTheme: { route: "config.getTheme" },
    setTheme: { route: "config.setTheme", mapInput: (theme: unknown) => ({ theme }) },
    getFloatingButton: { route: "config.getFloatingButton" },
    setFloatingButton: { route: "config.setFloatingButton", mapInput: (v: unknown) => ({ enabled: v }) },
    getSyncSettings: { route: "config.getSyncSettings" },
    updateSyncSettings: { route: "config.updateSyncSettings", mapInput: (s: unknown) => ({ settings: s }) },
    getDefaultProjectPath: { route: "config.getDefaultProjectPath" },
    setDefaultProjectPath: { route: "config.setDefaultProjectPath", mapInput: (p: unknown) => ({ path: p }) },
    getShortcutKeys: { route: "config.getShortcutKeys" },
    setShortcutKeys: { route: "config.setShortcutKeys", mapInput: (keys: unknown) => ({ keys }) },
    resetShortcutKeys: { route: "config.resetShortcutKeys" },
    listCustomPrompts: { route: "config.listCustomPrompts" },
    setCustomPrompts: { route: "config.setCustomPrompts", mapInput: (p: unknown) => ({ prompts: p }) },
    addCustomPrompt: { route: "config.addCustomPrompt", mapInput: (p: unknown) => ({ prompt: p }) },
    updateCustomPrompt: {
      route: "config.updateCustomPrompt",
      mapInput: (id: string, p: unknown) => ({ id, prompt: p }),
    },
    deleteCustomPrompt: { route: "config.deleteCustomPrompt", mapInput: (id: string) => ({ id }) },
    getSystemPrompts: { route: "config.getSystemPrompts" },
    setSystemPrompts: { route: "config.setSystemPrompts", mapInput: (p: unknown) => ({ prompts: p }) },
    addSystemPrompt: { route: "config.addSystemPrompt", mapInput: (p: unknown) => ({ prompt: p }) },
    updateSystemPrompt: {
      route: "config.updateSystemPrompt",
      mapInput: (id: string, p: unknown) => ({ id, prompt: p }),
    },
    deleteSystemPrompt: { route: "config.deleteSystemPrompt", mapInput: (id: string) => ({ id }) },
    getDefaultSystemPrompt: { route: "config.getDefaultSystemPrompt" },
    setDefaultSystemPrompt: { route: "config.setDefaultSystemPrompt", mapInput: (p: unknown) => ({ prompt: p }) },
    setDefaultSystemPromptId: { route: "config.setDefaultSystemPromptId", mapInput: (id: string) => ({ id }) },
    resetDefaultSystemPrompt: { route: "config.resetDefaultSystemPrompt" },
    clearDefaultSystemPrompt: { route: "config.clearDefaultSystemPrompt" },
    getAcpState: { route: "config.getAcpState" },
    setAcpEnabled: { route: "config.setAcpEnabled", mapInput: (v: unknown) => ({ enabled: v }) },
    listAgents: {
      route: "config.listAgents",
      mapOutput: (output: unknown) => (output as { agents?: unknown } | null | undefined)?.agents ?? [],
    },
    createArgosAgent: {
      route: "config.createArgosAgent",
      mapInput: (input: unknown) => input,
      mapOutput: (output: unknown) => (output as { agent?: unknown } | null | undefined)?.agent ?? null,
    },
    updateArgosAgent: {
      route: "config.updateArgosAgent",
      mapInput: (agentId: string, updates: unknown) => ({ agentId, updates }),
      mapOutput: (output: unknown) => (output as { agent?: unknown } | null | undefined)?.agent ?? null,
    },
    deleteArgosAgent: {
      route: "config.deleteArgosAgent",
      mapInput: (agentId: string) => ({ agentId }),
      mapOutput: (output: unknown) => Boolean((output as { removed?: unknown } | null | undefined)?.removed),
    },
    getKnowledgeConfigs: { route: "config.getKnowledgeConfigs" },
    setKnowledgeConfigs: { route: "config.setKnowledgeConfigs", mapInput: (c: unknown) => ({ configs: c }) },
    getVoiceAiConfig: { route: "config.getVoiceAiConfig" },
    updateVoiceAiConfig: { route: "config.updateVoiceAiConfig", mapInput: (c: unknown) => ({ config: c }) },
    getGeminiSafety: { route: "config.getGeminiSafety" },
    setGeminiSafety: { route: "config.setGeminiSafety", mapInput: (s: unknown) => ({ settings: s }) },
    getMcpServers: { route: "config.getMcpServers" },
    refreshProviderDb: { route: "providers.listSummaries" },
  },
  devicePresenter: {
    getAppVersion: {
      route: "device.getAppVersion",
      mapOutput: (output: unknown) =>
        typeof output === "string" ? output : ((output as { version?: unknown } | null | undefined)?.version ?? ""),
    },
    getInfo: { route: "device.getInfo" },
    sanitizeSvg: { route: "device.sanitizeSvg", mapInput: (svg: unknown) => ({ svg }) },
  },
  modelPresenter: {
    getProviderCatalog: {
      route: "models.getProviderCatalog",
      mapInput: (providerId: string) => ({ providerId }),
    },
    listRuntime: {
      route: "models.listRuntime",
      mapInput: (providerId: string) => ({ providerId }),
      mapOutput: (output: unknown) => (output as { models?: unknown } | null | undefined)?.models ?? [],
    },
    setStatus: {
      route: "models.setStatus",
      mapInput: (providerId: string, modelId: string, enabled: boolean) => ({ providerId, modelId, enabled }),
    },
    setBatchStatus: {
      route: "models.setBatchStatus",
      mapInput: (providerId: string, updates: unknown) => ({ providerId, updates }),
    },
  },
  mcpPresenter: {
    getServers: { route: "mcp.getServers" },
    addServer: { route: "mcp.addServer", mapInput: (cfg: unknown) => ({ config: cfg }) },
    updateServer: { route: "mcp.updateServer", mapInput: (id: string, cfg: unknown) => ({ id, config: cfg }) },
    removeServer: { route: "mcp.removeServer", mapInput: (id: string) => ({ id }) },
    setServerEnabled: { route: "mcp.setServerEnabled", mapInput: (id: string, v: unknown) => ({ id, enabled: v }) },
    startServer: { route: "mcp.startServer", mapInput: (id: string) => ({ id }) },
    stopServer: { route: "mcp.stopServer", mapInput: (id: string) => ({ id }) },
    isServerRunning: { route: "mcp.isServerRunning", mapInput: (id: string) => ({ id }) },
    listToolDefinitions: { route: "mcp.listToolDefinitions" },
    callTool: {
      route: "mcp.callTool",
      mapInput: (serverId: string, tool: string, args: unknown) => ({ serverId, toolName: tool, arguments: args }),
    },
  },
  skillPresenter: {
    listMetadata: { route: "skills.listMetadata" },
    getDirectory: { route: "skills.getDirectory" },
    installFromFolder: { route: "skills.installFromFolder", mapInput: (p: unknown) => ({ folderPath: p }) },
    uninstall: { route: "skills.uninstall", mapInput: (id: string) => ({ skillId: id }) },
    getActive: { route: "skills.getActive" },
    setActive: { route: "skills.SetActive", mapInput: (ids: unknown) => ({ skillIds: ids }) },
  },
  knowledgePresenter: {
    getKnowledgeConfigs: { route: "config.getKnowledgeConfigs" },
    setKnowledgeConfigs: { route: "config.setKnowledgeConfigs", mapInput: (c: unknown) => ({ configs: c }) },
  },
  agentSessionPresenter: {
    listSessions: { route: "sessions.list" },
    getActive: { route: "sessions.getActive" },
    rename: { route: "sessions.rename", mapInput: (id: string, name: string) => ({ id, name }) },
  },
  settingsPresenter: {
    getSnapshot: { route: "settings.getSnapshot" },
    update: { route: "settings.update", mapInput: (s: unknown) => ({ settings: s }) },
    listSystemFonts: { route: "settings.listSystemFonts" },
    activityList: { route: "settings.activity.list" },
  },
  sessionPresenter: {
    list: { route: "sessions.list" },
    create: { route: "sessions.create" },
    activate: { route: "sessions.activate", mapInput: (id: string) => ({ id }) },
    delete: { route: "sessions.delete", mapInput: (id: string) => ({ id }) },
    rename: { route: "sessions.rename", mapInput: (id: string, name: string) => ({ id, name }) },
    searchHistory: { route: "sessions.searchHistory", mapInput: (q: string) => ({ query: q }) },
  },
  oauthPresenter: {
    startCopilotDeviceFlow: { route: "providers.testConnection" },
  },
};

// ── IPC Renderer shim ─────────────────────────────────────────────────

type IpcListener = (...args: unknown[]) => void;
type WebBridgeWindow = Window & {
  electron?: {
    ipcRenderer?: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      send(channel: string, ...args: unknown[]): void;
      on(channel: string, listener: IpcListener): { dispose?: () => void } | (() => void);
      removeListener(channel: string, listener: IpcListener): void;
      removeAllListeners(channel: string): void;
    };
  };
  api?: {
    copyText(text: string): void;
    readClipboardText(): string;
    openExternal(url: string): void;
    getPathForFile(file: File): string;
    getWindowId(): number | null;
    getWebContentsId(): number | null;
  };
};

const eventListeners = new Map<string, Set<IpcListener>>();
let ws: WebSocket | null = null;
const pendingRoutes = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ensureWs(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  ws = new WebSocket(`ws://127.0.0.1:9527/api/v1/events`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "event") {
        const listeners = eventListeners.get(msg.name);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener({}, msg.payload);
            } catch {
              /* swallow */
            }
          }
        }
        const wildcard = eventListeners.get("*");
        if (wildcard) {
          for (const listener of wildcard) {
            try {
              listener({}, msg.payload);
            } catch {
              /* swallow */
            }
          }
        }
      } else if (msg.type === "route:response") {
        const pending = pendingRoutes.get(msg.requestId);
        if (pending) {
          pendingRoutes.delete(msg.requestId);
          if (msg.ok) {
            pending.resolve(msg.output);
          } else {
            pending.reject(new Error(msg.error?.message ?? "Route failed"));
          }
        }
      }
    } catch {
      /* swallow parse errors */
    }
  };

  ws.onclose = () => {
    ws = null;
  };

  return ws;
}

function daemonInvoke(route: string, input: unknown): Promise<unknown> {
  return fetch(`${DAEMON_URL}/api/v1/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, input }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error?.message ?? "Daemon route failed");
      return data.output;
    });
}

function resolvePresenterCall(
  presenterName: string,
  methodName: string,
  args: unknown[],
): { route: string; input: unknown; mapOutput?: (output: unknown) => unknown } | null {
  const presenter = ROUTE_MAP[presenterName];
  if (!presenter) return null;

  const entry = presenter[methodName];
  if (!entry) return null;

  const input = entry.mapInput ? entry.mapInput(...args) : (args[0] ?? {});
  return { route: entry.route, input, mapOutput: entry.mapOutput };
}

/**
 * Map `remoteControlPresenter` method calls to daemon `remote.*` routes.
 *
 * Two method shapes:
 *  - Generic:   `<verb>Channel<Noun>(channel, …)`  e.g. `getChannelSettings("telegram")`
 *  - Shortcut:  `<verb><Channel><Noun>(…)`         e.g. `getTelegramSettings()`, `clearTelegramBindings()`
 *
 * Both normalize to `{ channel, op }` where `op` is `<verb><Noun>` (e.g.
 * `getSettings`, `saveSettings`, `clearBindings`, `getPairingSnapshot`).
 */
async function resolveRemoteControlRoute(args: unknown[]): Promise<unknown> {
  const [method, ...payloads] = args as [string, ...unknown[]];

  const CHANNEL_BY_PREFIX: Record<string, string> = {
    Telegram: "telegram",
    Discord: "discord",
    QQBot: "qqbot",
    WeixinIlink: "weixin-ilink",
  };

  // No-channel methods.
  if (method === "listRemoteChannels") {
    const out = await daemonInvoke("remote.listChannels", {});
    return (out as { channels?: unknown } | null)?.channels ?? [];
  }

  // WeChat login flow + account management (channel-fixed, multi-arg).
  if (method === "startWeixinIlinkLogin") {
    return daemonInvoke("remote.weixin.startLogin", (payloads[0] as { force?: boolean }) ?? {});
  }
  if (method === "waitForWeixinIlinkLogin") {
    return daemonInvoke("remote.weixin.waitForLogin", payloads[0] ?? {});
  }
  if (method === "removeWeixinIlinkAccount") {
    await daemonInvoke("remote.weixin.removeAccount", { accountId: payloads[0] });
    return undefined;
  }
  if (method === "restartWeixinIlinkAccount") {
    await daemonInvoke("remote.weixin.restartAccount", { accountId: payloads[0] });
    return undefined;
  }

  // Resolve { channel, op }.
  let channel: string;
  let op: string; // verb + Noun, e.g. "saveSettings", "clearBindings"
  const isGeneric = method.includes("Channel");
  if (isGeneric) {
    channel = String(payloads[0] ?? "");
    // getChannelSettings → "getSettings"; saveChannelSettings → "saveSettings".
    op = method.replace("Channel", "");
  } else {
    // Shortcut: find the embedded channel name.
    let found: string | undefined;
    for (const [prefix, channelId] of Object.entries(CHANNEL_BY_PREFIX)) {
      const idx = method.indexOf(prefix);
      if (idx >= 0) {
        found = channelId;
        const verb = method.slice(0, idx); // "get" | "save" | "remove" | "create" | "clear"
        const noun = method.slice(idx + prefix.length); // "Settings" | "PairingSnapshot" | …
        op = verb + (noun ? noun[0].toUpperCase() + noun.slice(1) : "");
        break;
      }
    }
    if (!found || !op!) {
      console.warn(`[WebBridge] Unmapped remoteControl method: ${method}`);
      return null;
    }
    channel = found;
  }

  switch (op) {
    case "getSettings": {
      const out = await daemonInvoke("remote.getChannelSettings", { channel });
      return (out as { settings?: unknown } | null)?.settings ?? null;
    }
    case "saveSettings": {
      // Generic: (channel, settings); shortcut: (settings).
      const settings = payloads[isGeneric ? 1 : 0];
      const out = await daemonInvoke("remote.saveChannelSettings", { channel, settings });
      return (out as { settings?: unknown } | null)?.settings ?? null;
    }
    case "getStatus": {
      const out = await daemonInvoke("remote.getChannelStatus", { channel });
      return (out as { status?: unknown } | null)?.status ?? null;
    }
    case "getBindings": {
      const out = await daemonInvoke("remote.getChannelBindings", { channel });
      return (out as { bindings?: unknown[] } | null)?.bindings ?? [];
    }
    case "removeBinding": {
      const endpointKey = String(payloads[isGeneric ? 1 : 0]);
      await daemonInvoke("remote.removeChannelBinding", { channel, endpointKey });
      return undefined;
    }
    case "removePrincipal": {
      const principalId = String(payloads[isGeneric ? 1 : 0]);
      await daemonInvoke("remote.removeChannelPrincipal", { channel, principalId });
      return undefined;
    }
    case "getPairingSnapshot": {
      const out = await daemonInvoke("remote.getChannelPairing", { channel });
      return (out as { snapshot?: unknown } | null)?.snapshot ?? null;
    }
    case "createPairCode":
      return daemonInvoke("remote.createPairCode", { channel });
    case "clearPairCode":
      await daemonInvoke("remote.clearPairCode", { channel });
      return undefined;
    case "clearBindings": {
      const out = await daemonInvoke("remote.clearBindings", { channel });
      return (out as { count?: number } | null)?.count ?? 0;
    }
    default:
      console.warn(`[WebBridge] Unmapped remoteControl method: ${method} (op=${op})`);
      return null;
  }
}

function resolvePresenterFallback(presenterName: string, methodName: string, args: unknown[]): unknown | undefined {
  // Web mode has no local proxy stack — proxy settings are no-ops that return
  // sensible defaults so the settings UI renders without warnings/crashes.
  if (presenterName === "configPresenter") {
    if (methodName === "getProxyMode") return "none";
    if (methodName === "setProxyMode") return args[0];
    if (methodName === "getCustomProxyUrl") return "";
    if (methodName === "setCustomProxyUrl") return args[0];

    // Desktop-only settings keys (e.g. maxFileSize) aren't persisted by the
    // daemon; treat them as no-ops so the UI keeps its default instead of 500ing.
    if (methodName === "getSetting") {
      const key = String(args[0] ?? "");
      return DAEMON_CONFIG_KEYS.has(key) ? undefined : null;
    }
    if (methodName === "setSetting") {
      const key = String(args[0] ?? "");
      return DAEMON_CONFIG_KEYS.has(key) ? undefined : args[1];
    }
  }

  // API key status verification needs the desktop keychain; unavailable in web mode.
  if (presenterName === "llmproviderPresenter" && methodName === "getKeyStatus") {
    return null;
  }

  // Usage stats / dashboard backend isn't exposed to web mode yet.
  if (presenterName === "agentSessionPresenter") {
    if (methodName === "startUsageStatsBackfill") return undefined;
    if (methodName === "getUsageDashboard") return EMPTY_USAGE_DASHBOARD;
  }

  // System fonts can't be enumerated in a browser; return an empty list so the
  // font picker falls back to its built-in defaults without a daemon round-trip.
  if (presenterName === "settingsPresenter" && methodName === "listSystemFonts") {
    return [];
  }

  if (presenterName === "configPresenter" && methodName === "getSkillDraftSuggestionsEnabled") {
    return false;
  }

  if (presenterName === "configPresenter" && methodName === "getHooksNotificationsConfig") {
    return { hooks: [] };
  }

  if (presenterName === "configPresenter" && methodName === "setHooksNotificationsConfig") {
    return args[0];
  }

  if (presenterName === "configPresenter" && methodName === "getUpdateChannel") {
    return "stable";
  }

  if (presenterName === "configPresenter" && methodName === "setUpdateChannel") {
    return typeof args[0] === "string" ? args[0] : "stable";
  }

  if (presenterName === "exporter" && methodName === "getNowledgeMemConfig") {
    return null;
  }

  if (presenterName === "exporter" && methodName === "testNowledgeMemConnection") {
    return {
      success: false,
      message: "Nowledge-Mem is unavailable in web mode",
      error: "Nowledge-Mem is unavailable in web mode",
    };
  }

  if (presenterName === "exporter" && methodName === "updateNowledgeMemConfig") {
    return undefined;
  }

  if (presenterName === "sessionPresenter" && methodName === "getNowledgeMemConfig") {
    return null;
  }

  if (presenterName === "knowledgePresenter" && methodName === "isSupported") {
    return false;
  }

  if (presenterName !== "skillSyncPresenter") {
    return undefined;
  }

  if (methodName === "scanExternalTools" || methodName === "getRegisteredTools") {
    return [];
  }

  if (methodName === "getScanCache") {
    return null;
  }

  if (methodName === "scanAndDetectNewDiscoveries" || methodName === "getNewDiscoveries") {
    return [];
  }

  if (methodName === "getToolsAndDiscoveries") {
    return { tools: [], discoveries: [] };
  }

  if (methodName === "acknowledgeDiscoveries") {
    return undefined;
  }

  if (methodName === "previewImport" || methodName === "previewExport") {
    return [];
  }

  if (methodName === "executeImport" || methodName === "executeExport") {
    return { success: false, imported: 0, exported: 0, skipped: 0, failed: [] };
  }

  if (methodName === "scanTool") {
    return {
      toolId: String(args[0] ?? ""),
      toolName: String(args[0] ?? ""),
      available: false,
      skillsDir: "",
      skills: [],
    };
  }

  if (methodName === "isToolAvailable") {
    return false;
  }

  return undefined;
}

/** Build the shimmed `ipcRenderer` object. */
function createWebIpcRenderer() {
  return {
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
      if (channel === "presenter:call") {
        const [presenterName, methodName, ...methodArgs] = args;
        const fallback = resolvePresenterFallback(presenterName as string, methodName as string, methodArgs);
        if (
          fallback !== undefined ||
          (presenterName === "skillSyncPresenter" && methodName === "acknowledgeDiscoveries")
        ) {
          return fallback;
        }
        const resolved = resolvePresenterCall(presenterName as string, methodName as string, methodArgs);
        if (resolved) {
          const output = await daemonInvoke(resolved.route, resolved.input);
          return resolved.mapOutput ? resolved.mapOutput(output) : output;
        }
        console.warn(`[WebBridge] Unmapped presenter call: ${presenterName}.${methodName}`);
        return null;
      }

      if (channel === "generate-pairing-url") {
        const resp = await fetch(`${DAEMON_URL}/api/v1/pair/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await resp.json();
        return data.url ?? null;
      }

      // Remote control: route presenter methods to daemon `remote.*` routes.
      // Config surface only — bot replies are deferred until the daemon has an
      // agent-loop runtime (see docs/architecture/remote-control-daemon-port/).
      if (channel === "remoteControlPresenter:call") {
        return resolveRemoteControlRoute(args);
      }

      // Fallback: try daemon route dispatch for any other channel
      console.warn(`[WebBridge] Unknown IPC channel: ${channel}`);
      return null;
    },

    send: (_channel: string, ..._args: unknown[]) => {
      if (_channel === "acp-terminal:input" || _channel === "acp-terminal:kill") {
        // Fire-and-forget to daemon (no-op in web mode for now)
        console.warn(`[WebBridge] Fire-and-forget IPC not supported: ${_channel}`);
      }
    },

    on: (channel: string, listener: IpcListener) => {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set());
      }
      eventListeners.get(channel)!.add(listener);

      // Ensure WebSocket is connected and subscribed
      const socket = ensureWs();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", events: [channel] }));
      }

      return {
        dispose: () => {
          eventListeners.get(channel)?.delete(listener);
        },
      };
    },

    removeListener: (channel: string, listener: IpcListener) => {
      eventListeners.get(channel)?.delete(listener);
    },

    removeAllListeners: (channel: string) => {
      eventListeners.delete(channel);
    },
  };
}

// ── window.api shim ───────────────────────────────────────────────────

function createWebApi() {
  return {
    copyText: (text: string) => {
      navigator.clipboard.writeText(text).catch(() => {
        // Fallback: create a temporary textarea
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      });
    },

    copyImage: (_image: string) => {},

    readClipboardText: (): string => {
      // Async clipboard read isn't available synchronously; return empty
      // Components that need clipboard should use async pattern
      return "";
    },

    openExternal: (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },

    getPathForFile: (file: File): string => {
      return file.name;
    },

    getWindowId: (): number | null => null,
    getWebContentsId: (): number => 0,
    getArch: (): string => (typeof process !== "undefined" ? process.arch : "unknown"),
  };
}

// ── Installation ──────────────────────────────────────────────────────

let installed = false;

export function installWebBridge(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  const webWindow = window as WebBridgeWindow;
  if (webWindow.electron?.ipcRenderer) return; // Already have real Electron IPC

  installed = true;

  // Shim window.electron.ipcRenderer
  if (!webWindow.electron) {
    (webWindow as any).electron = {};
  }
  (webWindow as any).electron.ipcRenderer = createWebIpcRenderer();

  // Shim window.api
  if (!webWindow.api) {
    (webWindow as any).api = createWebApi();
  }
}

/** Check if running in web mode (no Electron). */
export function isWebMode(): boolean {
  return typeof window !== "undefined" && !(window as WebBridgeWindow).electron?.ipcRenderer;
}
