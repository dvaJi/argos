import { serve } from "bun";
import { resolve } from "node:path";
import { handleRouteDispatch, dispatchRoute, setRouteDispatcher } from "./transport/http";
import type { RouteDispatcher } from "./transport/http";
import { authorize } from "./transport/auth";
import type { AuthGateConfig, ExposureMode } from "@argos/shared-contracts/auth";
import { handlePair, handleListSessions, handleRevokeSession, handleIssuePairingToken } from "./transport/auth-routes";
import { SessionAuthRepository } from "./host/session-auth-repository";
import { BunPathResolver } from "./host/bun-paths";
import { DaemonConfigPresenter } from "./host/daemonConfigPresenter";
import { DaemonArgosAgentRuntime } from "./host/daemonArgosAgentRuntime";
import { BunEventPublisher } from "./host/bun-event-publisher";
import { initializeDatabase } from "./host/db-init";
import { createDaemonDispatcher } from "./dispatch/daemonDispatcher";
import { DaemonWorkspacePresenter } from "./workspace/daemonWorkspacePresenter";
import { ProviderImportService } from "@argos/backend-core";
import { PiProviderExecutionPort } from "./host/pi-provider-execution";
import { PiAgentProfileManager } from "./host/piAgentProfileManager";
import { ArgosOrchestrationRuntime } from "./host/argosOrchestrationRuntime";
import { BUILTIN_ARGOS_AGENT_ID } from "@argos/agent-runtime";
import { AcpProviderExecutionPort } from "./host/acp-provider-execution";
import { createDaemonMcpPorts } from "./host/daemonMcpPorts";
import { DaemonMcpRuntime } from "./host/daemonMcpRuntime";
import { DaemonSkillRuntime } from "./host/daemonSkillRuntime";
import { DaemonSyncRuntime } from "./host/daemonSyncRuntime";
import { DaemonMemoryRuntime } from "./host/daemonMemoryRuntime";
import { DaemonRemoteControlRuntime } from "./host/daemonRemoteControlRuntime";
import { DaemonPluginPresenter } from "./host/daemonPluginPresenter";
import { DaemonScheduledTasks } from "./host/daemonScheduledTasks";
import { logger } from "./logging";
import { checkForUpdate, runSelfUpdate } from "./update";
import { resolveDaemonVersion } from "./version";
import { loadOrCreateEnvironmentId } from "./host/environment-identity";
import type { ProviderExecutionPort } from "@argos/backend-core";
import type { SendMessageInput, ToolInteractionResponse } from "@argos/shared/types/agent-interface";
import { formatRemoteMachinePairingCode } from "@argos/shared/remoteMachinePairing";
import {
  parseArgs,
  mergeOptions,
  ensureDirectories,
  setupGracefulShutdown,
  resolveWebRoot,
  type DaemonOptions,
} from "./lifecycle";

type DaemonProviderExecutionPort = Required<
  Pick<
    ProviderExecutionPort,
    | "sendMessage"
    | "getActiveGeneration"
    | "steerActiveTurn"
    | "respondToolInteraction"
    | "cancelGeneration"
    | "compactSession"
    | "testConnection"
    | "generateCompletion"
    | "transcribeAudio"
    | "warmupAcpProcess"
    | "getAcpProcessConfigOptions"
    | "runAcpDebugAction"
    | "getAcpAgentDiagnostics"
    | "setAcpWorkdir"
    | "getAcpWorkdir"
    | "getAcpProcessModes"
    | "setAcpPreferredProcessMode"
    | "prepareAcpSession"
    | "clearAcpSession"
    | "getAcpSessionModes"
    | "setAcpSessionMode"
    | "resolveAgentPermission"
  >
>;

const startTime = Date.now();

function isNonLoopbackHost(host: string): boolean {
  return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PLUGIN_SETTINGS_BRIDGE_SOURCE = String.raw`(() => {
  const scriptUrl = new URL(document.currentScript.src);
  const pluginId = scriptUrl.searchParams.get("pluginId") || "";
  const pending = new Map();
  let requestCounter = 0;

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.source !== "argos-plugin-settings-host" || typeof message.requestId !== "string") return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(message.error || "Plugin settings request failed"));
  });

  const request = (method, args = []) => new Promise((resolve, reject) => {
    const requestId = String(++requestCounter);
    pending.set(requestId, { resolve, reject });
    window.parent.postMessage({
      source: "argos-plugin-settings-frame",
      requestId,
      pluginId,
      method,
      args,
    }, "*");
  });

  Object.defineProperty(window, "argosPlugin", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      getPluginId: () => pluginId,
      getStatus: () => request("getStatus"),
      enable: () => request("enable"),
      disable: () => request("disable"),
      invokeAction: (actionId, payload) => request("invokeAction", [actionId, payload]),
    }),
  });
})();`;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function inferPreviewContentType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "text/html; charset=utf-8";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function serveStaticWeb(webRoot: string, pathname: string): Response {
  const safePath = pathname
    .split("/")
    .filter((s) => s.length > 0 && s !== ".." && s !== ".")
    .join("/");
  const resolvedRoot = resolve(webRoot);

  const tryFile = (relativePath: string): Bun.BunFile | null => {
    const file = Bun.file(`${resolvedRoot}/${relativePath}`);
    return file.size > 0 ? file : null;
  };

  const relativeFilePath = safePath || "index.html";
  const file = tryFile(relativeFilePath);
  if (file) {
    const ext = relativeFilePath.match(/\.[^.]+$/)?.[0] ?? "";
    const isHashedAsset = relativeFilePath.startsWith("assets/");
    return new Response(file, {
      headers: {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  }

  const indexFile = tryFile("index.html");
  if (indexFile) {
    return new Response(indexFile, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  return Response.json({ ok: false, error: { code: "not_found", message: "Web assets not found" } }, { status: 404 });
}

async function servePluginSettingsAsset(
  pluginPresenter: DaemonPluginPresenter,
  pluginId: string,
  assetPath: string,
): Promise<Response> {
  const entry = pluginPresenter.resolveSettingsWebAsset(pluginId, "");
  if (!entry) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Plugin settings not found" } },
      { status: 404 },
    );
  }

  if (assetPath === "__argos_bridge.js") {
    return new Response(PLUGIN_SETTINGS_BRIDGE_SOURCE, {
      headers: {
        "Content-Type": MIME_TYPES[".js"],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const asset = pluginPresenter.resolveSettingsWebAsset(pluginId, assetPath);
  if (!asset) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Plugin settings asset not found" } },
      { status: 404 },
    );
  }

  const ext = asset.filePath.match(/\.[^.]+$/)?.[0] ?? "";
  if (asset.isEntry) {
    const html = await Bun.file(asset.filePath).text();
    const bridgeTag = `<script src="./__argos_bridge.js?pluginId=${encodeURIComponent(pluginId)}"></script>`;
    const content = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${bridgeTag}</head>`) : `${bridgeTag}${html}`;
    return new Response(content, {
      headers: {
        "Content-Type": MIME_TYPES[".html"],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(Bun.file(asset.filePath), {
    headers: {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export type DaemonHandle = {
  port: number;
  close: () => Promise<void>;
  eventPublisher: BunEventPublisher;
};

export async function startDaemon(options?: {
  dispatcher?: RouteDispatcher;
  dataDir?: string;
  host?: string;
  port?: number;
  desktopBootstrapSecret?: string;
  web?: boolean;
  webRoot?: string;
  pair?: boolean;
  noUpdateCheck?: boolean;
}): Promise<DaemonHandle> {
  const webRootResolution = options?.web ? resolveWebRoot({ explicitWebRoot: options.webRoot }) : null;
  if (webRootResolution && !webRootResolution.ok) {
    throw new Error(webRootResolution.message);
  }
  const webRoot = webRootResolution?.ok ? webRootResolution.root : null;

  const paths = new BunPathResolver(options?.dataDir);
  ensureDirectories(paths);
  const environmentId = loadOrCreateEnvironmentId(paths.getDataDir());

  logger.info("[daemon] Initializing database...");
  const db = await initializeDatabase(paths.getDatabasePath());

  const eventPublisher = new BunEventPublisher();
  const configPresenter = new DaemonConfigPresenter(paths.getConfigDir(), paths.getDataDir(), db);
  await configPresenter.initializeMcpHeadlessDefaults();

  const argosAgentRuntimeHost = new DaemonArgosAgentRuntime(db);
  argosAgentRuntimeHost.ensureBuiltinAgent();
  argosAgentRuntimeHost.ensureBuiltinOrchestratorAgent();
  configPresenter.setArgosAgentRuntime(argosAgentRuntimeHost.runtime);
  logger.info("[daemon] Argos agent runtime initialized");

  const { BunSessionRepository } = await import("./host/bun-session-repository");
  const sessionRepository = new BunSessionRepository(db, eventPublisher);
  const orchestrationRuntime = new ArgosOrchestrationRuntime(db, () => configPresenter.listAgents());
  const memoryRuntime = new DaemonMemoryRuntime({
    db,
    configPresenter,
    dataDir: paths.getDataDir(),
  });
  memoryRuntime.presenter.startBackgroundMaintenance();
  logger.info("[daemon] Memory runtime initialized");

  const sessions = await sessionRepository.list();
  logger.info(`[daemon] Restored ${sessions.length} session(s) from database`);

  await sessionRepository.deactivate(0);
  if (sessions.length > 0) {
    logger.info(`[daemon] Reset active sessions to idle`);
  }

  const piProfiles = new PiAgentProfileManager(paths.getDataDir(), resolveDaemonVersion());
  const piProviderExecutionPort = new PiProviderExecutionPort(
    configPresenter,
    sessionRepository,
    piProfiles,
    eventPublisher,
    {
      listTools: async (sessionId) => {
        const session = await sessionRepository.get(sessionId);
        const definitions = await mcpRuntime.listToolDefinitions();
        if (!session) return definitions;
        const agentConfig = await configPresenter.resolveArgosAgentConfig(session.agentId);
        const allowed = agentConfig?.enabledMcpServerIds;
        const scoped = Array.isArray(allowed)
          ? definitions.filter((tool) => allowed.includes(tool.server.name))
          : definitions;
        const orchestration = agentConfig?.orchestrationEnabled
          ? [...scoped, ...orchestrationRuntime.definitions()]
          : scoped;
        return agentConfig?.memoryEnabled === true
          ? [...orchestration, ...memoryRuntime.toolDefinitions()]
          : orchestration;
      },
      callTool: async (request) => {
        if (orchestrationRuntime.handles((request as any).function?.name)) {
          return orchestrationRuntime.call(request as any);
        }
        if (memoryRuntime.handlesTool((request as any).function?.name)) {
          const sessionId = (request as any).conversationId as string | undefined;
          const session = sessionId ? await sessionRepository.get(sessionId) : null;
          if (!session?.agentId) {
            throw new Error("Memory tool requires an active session with an agent.");
          }
          return memoryRuntime.callMemoryTool(request as any, session.agentId);
        }
        return mcpRuntime.callApprovedTool(request);
      },
    },
  );
  const acpProviderExecutionPort = new AcpProviderExecutionPort(configPresenter, sessionRepository, eventPublisher, {
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
    db,
  });

  // Route execution by session provider: ACP-backed sessions go to the ACP port,
  // everything else to the HTTP/LLM port.
  const providerExecutionPort: DaemonProviderExecutionPort = {
    getActiveGeneration(sessionId) {
      return (
        acpProviderExecutionPort.getActiveGeneration(sessionId) ??
        piProviderExecutionPort.getActiveGeneration(sessionId)
      );
    },
    async sendMessage(sessionId, content) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.sendMessage(sessionId, content)
        : piProviderExecutionPort.sendMessage(sessionId, content);
    },
    async steerActiveTurn(sessionId, content) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.steerActiveTurn(sessionId, content)
        : piProviderExecutionPort.steerActiveTurn(sessionId, content);
    },
    async respondToolInteraction(sessionId, messageId, toolCallId, response) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.respondToolInteraction(sessionId, messageId, toolCallId, response)
        : piProviderExecutionPort.respondToolInteraction(sessionId, messageId, toolCallId, response);
    },
    async cancelGeneration(sessionId) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.cancelGeneration(sessionId)
        : piProviderExecutionPort.cancelGeneration(sessionId);
    },
    async compactSession(sessionId, instructions) {
      const session = await sessionRepository.get(sessionId);
      if ((session as any)?.providerId === "acp") return;
      return piProviderExecutionPort.compactSession(sessionId, instructions);
    },
    async testConnection(providerId, modelId) {
      return providerId === "acp"
        ? acpProviderExecutionPort.testConnection(providerId, modelId)
        : piProviderExecutionPort.testConnection(providerId, modelId);
    },
    async generateCompletion(input) {
      return piProviderExecutionPort.generateCompletion(input);
    },
    async transcribeAudio(providerId, modelId, audioBase64, mimeType, filename) {
      return piProviderExecutionPort.transcribeAudio(providerId, modelId, audioBase64, mimeType, filename);
    },
    async warmupAcpProcess(agentId, workdir) {
      return acpProviderExecutionPort.warmupAcpProcess(agentId, workdir);
    },
    async getAcpProcessConfigOptions(agentId, workdir) {
      return acpProviderExecutionPort.getAcpProcessConfigOptions(agentId, workdir);
    },
    async runAcpDebugAction(request) {
      return acpProviderExecutionPort.runAcpDebugAction(request);
    },
    async getAcpAgentDiagnostics(agentId, workdir) {
      return acpProviderExecutionPort.getAcpAgentDiagnostics(agentId, workdir);
    },
    async setAcpWorkdir(conversationId, agentId, workdir) {
      return acpProviderExecutionPort.setAcpWorkdir(conversationId, agentId, workdir);
    },
    async getAcpWorkdir(conversationId, agentId) {
      return acpProviderExecutionPort.getAcpWorkdir(conversationId, agentId);
    },
    async getAcpProcessModes(agentId, workdir) {
      return acpProviderExecutionPort.getAcpProcessModes(agentId, workdir);
    },
    async setAcpPreferredProcessMode(agentId, modeId) {
      return acpProviderExecutionPort.setAcpPreferredProcessMode(agentId, modeId);
    },
    async prepareAcpSession(conversationId, agentId, workdir) {
      return acpProviderExecutionPort.prepareAcpSession(conversationId, agentId, workdir);
    },
    async clearAcpSession(sessionId) {
      return acpProviderExecutionPort.clearAcpSession(sessionId);
    },
    async getAcpSessionModes(conversationId) {
      return acpProviderExecutionPort.getAcpSessionModes(conversationId);
    },
    async setAcpSessionMode(conversationId, modeId) {
      return acpProviderExecutionPort.setAcpSessionMode(conversationId, modeId);
    },
    async resolveAgentPermission(requestId, granted) {
      return acpProviderExecutionPort.resolveAgentPermission(requestId, granted);
    },
  };

  orchestrationRuntime.setSessionActions({
    send: (sessionId, text) => providerExecutionPort.sendMessage(sessionId, text),
    steer: (sessionId, text) => providerExecutionPort.steerActiveTurn(sessionId, text),
    stop: (sessionId) => providerExecutionPort.cancelGeneration(sessionId),
  });

  const sessionAuthRepo = new SessionAuthRepository(db);

  const mcpPorts = createDaemonMcpPorts({
    appVersion: resolveDaemonVersion(),
    eventPublisher,
    configPresenter,
    configDir: paths.getConfigDir(),
    sessionRepository,
    db,
  });
  const mcpRuntime = new DaemonMcpRuntime(configPresenter, mcpPorts);
  void mcpRuntime
    .startEnabledServers()
    .then(({ started, failed }) => {
      logger.info(`[daemon] MCP startup complete: ${started.length} started, ${failed.length} failed`);
    })
    .catch((error) => {
      logger.error("[daemon] MCP startup failed before server initialization", error);
    });
  const skillRuntime = new DaemonSkillRuntime({
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
    eventPublisher,
    configPresenter,
    sessionRepository,
  });
  (skillRuntime as typeof skillRuntime & { piProfiles: PiAgentProfileManager }).piProfiles = piProfiles;
  const SAFE_MCP_CONFIG_FIELDS = new Set(["type", "command", "descriptions", "description", "enabled", "disable"]);
  const redactUnknownValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(() => "[configured]");
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value as Record<string, unknown>).map((key) => [key, "[configured]"]));
    }
    return "[configured]";
  };
  const redactMcpServers = (servers: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(servers).map(([name, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [name, value];
        const config = value as Record<string, unknown>;
        const redacted: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(config)) {
          // Only explicitly non-sensitive fields are exposed to the orchestrator model
          // verbatim; everything else (env, customHeaders, args, baseUrl, unknown maps)
          // is masked so credentials cannot leak.
          redacted[key] = SAFE_MCP_CONFIG_FIELDS.has(key) ? val : redactUnknownValue(val);
        }
        return [name, redacted];
      }),
    );
  const validateProvisionedAgent = async (agentId: string, requireEnabled = true) => {
    const agent = await configPresenter.getArgosAgent(agentId);
    if (!agent) throw new Error(`Argos agent not found: ${agentId}`);
    const effectiveConfig = await configPresenter.resolveArgosAgentConfig(agentId);
    const configuredServers = (await configPresenter.getMcpServers()) as Record<string, any>;
    const expectedServers = effectiveConfig.enabledMcpServerIds ?? [];
    const managedSkills = piProfiles.validateManagedSkills(agentId);
    const expectedSkills = agent.config?.enabledSkillNames ?? [];
    const checks = [
      {
        name: "model",
        ok: Boolean(effectiveConfig.defaultModelPreset?.modelId) || Boolean(effectiveConfig.assistantModel?.modelId),
      },
      { name: "enabled", ok: !requireEnabled || agent.enabled },
      {
        name: "mcp-configured",
        ok: expectedServers.every((name: string) => Boolean(configuredServers[name]?.enabled)),
        details: expectedServers,
      },
      {
        name: "mcp-running",
        ok: expectedServers.every((name: string) => mcpRuntime.isServerRunning(name)),
        details: expectedServers.filter((name: string) => !mcpRuntime.isServerRunning(name)),
      },
      {
        name: "skills-attached",
        ok: managedSkills.every((skill) => expectedSkills.includes(skill.name)),
        details: managedSkills.filter((skill) => !expectedSkills.includes(skill.name)).map((skill) => skill.name),
      },
      {
        name: "skill-hashes",
        ok: managedSkills.every((skill) => skill.exists && skill.hashMatches),
        details: managedSkills.filter((skill) => !skill.exists || !skill.hashMatches),
      },
    ];
    return { agentId, valid: checks.every((check) => check.ok), checks };
  };
  const provisioningActions: Parameters<typeof orchestrationRuntime.setProvisioningActions>[0] = {
    createAgent: (input) => configPresenter.createArgosAgent(input),
    async updateAgent(agentId, updates) {
      if (agentId === BUILTIN_ARGOS_AGENT_ID)
        throw new Error("The protected default Argos agent cannot be changed by provisioning.");
      const agent = await configPresenter.getArgosAgent(agentId);
      if (!agent) throw new Error(`Argos agent not found: ${agentId}`);
      return await configPresenter.updateArgosAgent(agentId, updates);
    },
    async listMcpServers() {
      return redactMcpServers((await configPresenter.getMcpServers()) as Record<string, unknown>);
    },
    async upsertMcpServer(serverName, config) {
      const name = serverName.trim();
      if (!name) throw new Error("An MCP server name is required.");
      const servers = (await configPresenter.getMcpServers()) as Record<string, unknown>;
      const normalized = { ...config, enabled: true, disable: false };
      if (Object.prototype.hasOwnProperty.call(servers, name)) {
        await configPresenter.updateMcpServer(name, normalized);
      } else {
        await configPresenter.addMcpServer(name, normalized);
      }
      await configPresenter.setMcpEnabled(true);
      await configPresenter.setMcpServerEnabled(name, true);
      if (mcpRuntime.isServerRunning(name)) await mcpRuntime.stopServer(name);
      await mcpRuntime.startServer(name);
      const redacted = redactMcpServers((await configPresenter.getMcpServers()) as Record<string, unknown>);
      return { serverName: name, config: redacted[name], running: true };
    },
    async setAgentMcpServers(agentId, serverNames) {
      const agent = await configPresenter.getArgosAgent(agentId);
      if (!agent) throw new Error(`Argos agent not found: ${agentId}`);
      const servers = (await configPresenter.getMcpServers()) as Record<string, unknown>;
      const normalized = Array.from(new Set(serverNames.map((name) => name.trim()).filter(Boolean)));
      const missing = normalized.filter((name) => !Object.prototype.hasOwnProperty.call(servers, name));
      if (missing.length) throw new Error(`Unknown MCP server(s): ${missing.join(", ")}`);
      const updated = await configPresenter.updateArgosAgent(agentId, {
        config: { ...agent.config, enabledMcpServerIds: normalized },
      });
      return { agent: updated, enabledMcpServerIds: normalized };
    },
    async listAgentSkills(agentId) {
      if (!(await configPresenter.getArgosAgent(agentId))) throw new Error(`Argos agent not found: ${agentId}`);
      return piProfiles.listManagedSkills(agentId);
    },
    async writeAgentSkill(agentId, input) {
      const agent = await configPresenter.getArgosAgent(agentId);
      if (!agent) throw new Error(`Argos agent not found: ${agentId}`);
      const skill = piProfiles.writeManagedSkill(agentId, input);
      const enabledSkillNames = Array.from(new Set([...(agent.config?.enabledSkillNames ?? []), skill.name]));
      await configPresenter.updateArgosAgent(agentId, {
        config: { ...agent.config, enabledSkillNames },
      });
      return { skill, enabledSkillNames };
    },
    async removeAgentSkill(agentId, name) {
      const agent = await configPresenter.getArgosAgent(agentId);
      if (!agent) throw new Error(`Argos agent not found: ${agentId}`);
      const removed = piProfiles.removeManagedSkill(agentId, name);
      const normalizedName = name.trim().toLowerCase();
      const enabledSkillNames = (agent.config?.enabledSkillNames ?? []).filter((item) => item !== normalizedName);
      await configPresenter.updateArgosAgent(agentId, {
        config: { ...agent.config, enabledSkillNames },
      });
      return { removed, name: normalizedName, enabledSkillNames };
    },
    async provisionAgent(input) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name) throw new Error("A provisioned agent name is required.");
      const description = typeof input.description === "string" ? input.description : undefined;
      const requestedConfig =
        input.config && typeof input.config === "object" && !Array.isArray(input.config)
          ? (input.config as Record<string, unknown>)
          : {};
      const mcpServers = Array.isArray(input.mcpServers)
        ? input.mcpServers.filter((item): item is { serverName: string; config: Record<string, unknown> } =>
            Boolean(
              item &&
              typeof item === "object" &&
              typeof (item as any).serverName === "string" &&
              (item as any).config &&
              typeof (item as any).config === "object" &&
              !Array.isArray((item as any).config),
            ),
          )
        : [];
      const skills = Array.isArray(input.skills)
        ? input.skills.filter((item): item is { name: string; description: string; instructions: string } =>
            Boolean(
              item &&
              typeof item === "object" &&
              typeof (item as any).name === "string" &&
              typeof (item as any).description === "string" &&
              typeof (item as any).instructions === "string",
            ),
          )
        : [];
      const beforeMcpEnabled = await configPresenter.getMcpEnabled();
      const beforeServers = (await configPresenter.getMcpServers()) as Record<string, any>;
      const snapshots = new Map(
        mcpServers.map(({ serverName }) => [
          serverName.trim(),
          {
            config: beforeServers[serverName.trim()],
            running: mcpRuntime.isServerRunning(serverName.trim()),
          },
        ]),
      );
      let createdAgentId: string | null = null;
      try {
        const created = await configPresenter.createArgosAgent({
          name,
          description,
          enabled: false,
          config: requestedConfig,
        });
        createdAgentId = created.id;
        for (const server of mcpServers) {
          await provisioningActions.upsertMcpServer(server.serverName, server.config);
        }
        await provisioningActions.setAgentMcpServers(
          created.id,
          mcpServers.map((server) => server.serverName),
        );
        for (const skill of skills) await provisioningActions.writeAgentSkill(created.id, skill);

        const validation = await validateProvisionedAgent(created.id, false);
        if (!validation.valid) {
          const failed = validation.checks.filter((check) => !check.ok).map((check) => check.name);
          throw new Error(`Provisioned agent validation failed: ${failed.join(", ")}`);
        }
        const enabled = input.enabled !== false;
        const agent = await configPresenter.updateArgosAgent(created.id, { enabled });
        return { agent, validation: await validateProvisionedAgent(created.id, enabled), rolledBack: false };
      } catch (error) {
        // Isolate each rollback step so one failure cannot skip remaining cleanup;
        // collect every rollback error and surface it with the original cause.
        // removeProfile recursively deletes the agent profile (incl. managed skills),
        // so written skills are cleaned up too.
        const rollbackErrors: { step: string; error: string }[] = [];
        const rollbackStep = async (step: string, run: () => Promise<unknown> | unknown) => {
          try {
            await run();
          } catch (rollbackError) {
            rollbackErrors.push({
              step,
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            });
          }
        };
        if (createdAgentId) {
          const rollbackAgentId = createdAgentId;
          await rollbackStep("delete-agent", () => configPresenter.deleteArgosAgent(rollbackAgentId));
          await rollbackStep("remove-profile", () => piProfiles.removeProfile(rollbackAgentId));
        }
        for (const [serverName, snapshot] of snapshots) {
          await rollbackStep(`stop-server:${serverName}`, async () => {
            if (mcpRuntime.isServerRunning(serverName)) await mcpRuntime.stopServer(serverName);
          });
          await rollbackStep(`restore-server:${serverName}`, async () => {
            if (snapshot.config) {
              await configPresenter.updateMcpServer(serverName, snapshot.config);
              await configPresenter.setMcpServerEnabled(serverName, snapshot.config.enabled !== false);
              if (snapshot.running) await mcpRuntime.startServer(serverName);
            } else {
              await configPresenter.removeMcpServer(serverName);
            }
          });
        }
        await rollbackStep("set-mcp-enabled", () => configPresenter.setMcpEnabled(beforeMcpEnabled));
        const originalMessage = error instanceof Error ? error.message : String(error);
        const rollbackDetail = rollbackErrors.length
          ? ` (rollback failures: ${rollbackErrors.map((entry) => `${entry.step} (${entry.error})`).join("; ")})`
          : "";
        throw new Error(`Agent provisioning rolled back: ${originalMessage}${rollbackDetail}`);
      }
    },
    validateAgent: (agentId) => validateProvisionedAgent(agentId),
  };
  orchestrationRuntime.setProvisioningActions(provisioningActions);
  const syncRuntime = new DaemonSyncRuntime({
    configDir: paths.getConfigDir(),
    eventPublisher,
    configPresenter,
  });
  const scheduledTasks = new DaemonScheduledTasks({
    configPresenter,
    eventPublisher,
    sessionRepository,
    providerExecutionPort,
  });
  scheduledTasks.start();
  const remoteControlRuntime = new DaemonRemoteControlRuntime({
    configPresenter,
    sessionRepository,
    providerExecutionPort,
    dataDir: paths.getDataDir(),
  });
  const pluginPresenter = new DaemonPluginPresenter({
    configPresenter,
    mcpPresenter: mcpRuntime,
    skillPresenter: skillRuntime.presenter,
    configDir: paths.getConfigDir(),
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
  });
  await pluginPresenter.initialize();
  await remoteControlRuntime.initialize();
  const providerImportService = new ProviderImportService(configPresenter as any, {
    sqliteReader: (dbPath) => {
      const { Database } = require("bun:sqlite");
      return new Database(dbPath, { readonly: true });
    },
  });

  const workspacePresenter = new DaemonWorkspacePresenter(eventPublisher, "http://127.0.0.1:0");

  const dispatcher =
    options?.dispatcher ??
    createDaemonDispatcher(
      configPresenter as any,
      eventPublisher,
      sessionRepository,
      providerExecutionPort,
      acpProviderExecutionPort as any,
      mcpRuntime,
      skillRuntime,
      scheduledTasks,
      syncRuntime,
      memoryRuntime,
      remoteControlRuntime,
      pluginPresenter,
      providerImportService,
      db,
      environmentId,
      orchestrationRuntime,
      workspacePresenter,
    );
  setRouteDispatcher(dispatcher);

  const host = options?.host || "127.0.0.1";
  const port = options?.port ?? 9527;

  const exposureMode: ExposureMode = isNonLoopbackHost(host) ? "network-accessible" : "local-only";
  const authConfig: AuthGateConfig = {
    exposureMode,
    desktopBootstrapSecret: options?.desktopBootstrapSecret,
    verifySession: (secret) => Promise.resolve(sessionAuthRepo.verifySession(secret)),
  };

  const server = serve({
    hostname: host,
    port,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          version: resolveDaemonVersion(),
          environmentId,
          uptime: Date.now() - startTime,
        });
      }

      if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      if (webRoot && !url.pathname.startsWith("/api/")) {
        return serveStaticWeb(webRoot, url.pathname);
      }

      if (url.pathname === "/api/v1/pair" && request.method === "POST") {
        return withCors(await handlePair(request, sessionAuthRepo));
      }

      const authResult = await authorize(request, authConfig);
      if (!authResult.ok) {
        return withCors(
          Response.json(
            { ok: false, error: { code: authResult.code, message: authResult.message } },
            { status: authResult.status },
          ),
        );
      }

      const pluginSettingsMatch = url.pathname.match(/^\/api\/v1\/plugins\/([^/]+)\/settings(?:\/(.*))?$/);
      if (pluginSettingsMatch && request.method === "GET") {
        try {
          const pluginId = decodeURIComponent(pluginSettingsMatch[1]);
          const assetPath = decodeURIComponent(pluginSettingsMatch[2] ?? "");
          return withCors(await servePluginSettingsAsset(pluginPresenter, pluginId, assetPath));
        } catch {
          return withCors(
            Response.json(
              { ok: false, error: { code: "bad_request", message: "Invalid plugin settings path" } },
              { status: 400 },
            ),
          );
        }
      }

      if (url.pathname === "/api/v1/route" && request.method === "POST") {
        return withCors(await handleRouteDispatch(request));
      }

      // Workspace file preview (html/pdf/svg) served as raw bytes. The path must
      // resolve inside a registered/allow-listed workspace; otherwise 404.
      if (url.pathname === "/api/v1/workspace/preview" && request.method === "GET") {
        const targetPath = url.searchParams.get("path");
        if (!targetPath || !workspacePresenter.isPathAllowed(targetPath)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const file = Bun.file(targetPath);
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          return withCors(
            new Response(file, {
              headers: { "Content-Type": inferPreviewContentType(targetPath), "Cache-Control": "no-store" },
            }),
          );
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }

      if (url.pathname === "/api/v1/sessions" && request.method === "GET") {
        return withCors(await handleListSessions(sessionAuthRepo));
      }

      if (url.pathname === "/api/v1/pair/token" && request.method === "POST") {
        return withCors(await handleIssuePairingToken(sessionAuthRepo, url.origin));
      }

      if (url.pathname.startsWith("/api/v1/sessions/") && request.method === "DELETE") {
        const sessionId = url.pathname.slice("/api/v1/sessions/".length);
        const response = handleRevokeSession(sessionAuthRepo, sessionId);
        if (response.ok) eventPublisher.revokeSession(sessionId);
        return withCors(response);
      }

      if (url.pathname === "/api/v1/events") {
        const success = (server as any).upgrade(request, {
          headers: request.headers.has("sec-websocket-protocol") ? { "Sec-WebSocket-Protocol": "argos-v1" } : undefined,
          data: {
            subscriptions: new Set<string>(),
            authContext: authResult.context,
          },
        });
        if (!success) {
          return withCors(
            Response.json(
              { ok: false, error: { code: "upgrade_failed", message: "WebSocket upgrade failed" } },
              { status: 500 },
            ),
          );
        }
        return undefined as unknown as Response;
      }

      return withCors(
        Response.json({ ok: false, error: { code: "not_found", message: "Unknown route" } }, { status: 404 }),
      );
    },
    websocket: {
      open(ws: any) {
        eventPublisher.addClient(ws);
        ws.subscribe("events");
        ws.send(
          JSON.stringify({
            type: "welcome",
            environmentId,
            serverVersion: resolveDaemonVersion(),
            protocolVersion: 1,
            eventTransport: { ready: true, protocol: "argos-v1" },
          }),
        );
      },
      close(ws: any) {
        eventPublisher.removeClient(ws);
        ws.unsubscribe("events");
      },
      async message(ws: any, message: string | Buffer) {
        if (typeof message !== "string") return;
        const sessionId = ws.data?.authContext?.sessionId;
        if (sessionId && !sessionAuthRepo.isSessionActive(sessionId)) {
          ws.close?.(4001, "Session revoked");
          return;
        }
        let parsed: any;
        try {
          parsed = JSON.parse(message);
        } catch {
          return;
        }

        if (parsed.type === "route" && parsed.requestId) {
          const result = await dispatchRoute(parsed.route, parsed.input);
          ws.send(
            JSON.stringify({
              type: "route:response",
              requestId: parsed.requestId,
              ok: result.ok,
              ...(result.ok ? { output: result.output } : { error: result.error }),
            }),
          );
        } else if (parsed.type === "subscribe" && Array.isArray(parsed.events)) {
          for (const eventName of parsed.events) {
            ws.subscribe(`event:${eventName}`);
            ws.data.subscriptions.add(eventName);
          }
        } else if (parsed.type === "unsubscribe" && Array.isArray(parsed.events)) {
          for (const eventName of parsed.events) {
            ws.unsubscribe(`event:${eventName}`);
            ws.data.subscriptions.delete(eventName);
          }
        }
      },
    } as any,
  });

  const serverPort = (server as any).port ?? port;
  workspacePresenter.setBaseUrl(`http://${host}:${serverPort}`);
  if (!isNonLoopbackHost(host)) {
    const originHost = host === "::1" ? "[::1]" : host;
    pluginPresenter.setSettingsBaseUrl(`http://${originHost}:${serverPort}`);
  }
  logger.info(`[daemon] Listening on http://${host}:${serverPort}`);
  logger.info(`[daemon] Health: http://${host}:${serverPort}/health`);
  logger.info(`[daemon] Routes: POST http://${host}:${serverPort}/api/v1/route`);
  logger.info(`[daemon] Events: ws://${host}:${serverPort}/api/v1/events`);
  if (webRoot) {
    logger.info(`[daemon] Web UI: http://${host}:${serverPort}`);
  }

  if (options?.pair) {
    const pairing = sessionAuthRepo.issuePairingToken("cli");
    const scheme = webRoot ? "http" : "http";
    const pairingUrl = `${scheme}://${host}:${serverPort}/pair?token=${pairing.token}`;
    console.log(`\n  Pairing URL: ${pairingUrl}`);
    if (host !== "0.0.0.0" && host !== "::") {
      console.log(`  Pairing code: ${formatRemoteMachinePairingCode(pairingUrl)}\n`);
    }
    if (host === "0.0.0.0" || host === "::") {
      console.log(
        "  Replace the wildcard host in this URL with the machine's reachable LAN or private-network address.\n" +
          "  The resulting URL is the pairing entry for Desktop.\n",
      );
    }
    logger.info(`[daemon] Pairing token expires at ${new Date(pairing.expiresAt).toISOString()}`);
  }

  if (!options?.noUpdateCheck) {
    void checkForUpdate().then((check) => {
      if (!check) return; // offline or rate-limited — stay silent
      if (check.hasUpdate) {
        logger.info(
          `[daemon] Update available: v${check.latest} (current v${check.current}). Run \`argos-daemon update\`.`,
        );
      } else {
        logger.info(`[daemon] Up to date (v${check.current}).`);
      }
    });
  }

  setupGracefulShutdown(eventPublisher, { stop: () => (server as any).stop() }, async () => {
    try {
      scheduledTasks.stop();
    } catch {
      logger.warn("[daemon] Failed to stop scheduled tasks cleanly");
    }
    try {
      await remoteControlRuntime.destroy();
    } catch {
      logger.warn("[daemon] Failed to shut down remote-control runtime cleanly");
    }
    try {
      await pluginPresenter.shutdown();
    } catch {
      logger.warn("[daemon] Failed to shut down plugin presenter cleanly");
    }
    try {
      await piProviderExecutionPort.dispose();
    } catch {
      logger.warn("[daemon] Failed to shut down Pi workers cleanly");
    }
    try {
      db.close();
      logger.info("[daemon] Database closed");
    } catch {
      logger.warn("[daemon] Failed to close database cleanly");
    }
  });

  return {
    port: serverPort,
    close: async () => {
      scheduledTasks.stop();
      memoryRuntime.presenter.stopBackgroundMaintenance();
      await memoryRuntime.presenter.dispose().catch(() => undefined);
      await remoteControlRuntime.destroy();
      await pluginPresenter.shutdown();
      await piProviderExecutionPort.dispose();
      (server as any).stop();
    },
    eventPublisher,
  };
}

export async function runDaemonCli(): Promise<void> {
  if (process.argv.includes("--version") || process.argv.includes("-V")) {
    console.log(resolveDaemonVersion());
    process.exit(0);
  }

  if (process.argv[2] === "update") {
    const rest = process.argv.slice(3);
    const flagValue = (name: string) => {
      const i = rest.indexOf(name);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    await runSelfUpdate({
      installDir: flagValue("--install-dir"),
      token: flagValue("--token") || process.env.GITHUB_TOKEN,
    });
    process.exit(0);
  }

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Argos Daemon - Headless backend server

Usage:
  argos-daemon [options]          Start the server
  argos-daemon update [options]   Update to the latest release

Options:
  --version, -V       Print the daemon version and exit
  --host <host>       Bind address (default: 127.0.0.1)
  --port <port>       Bind port (default: 9527, 0 for auto)
  --data-dir <path>   Data directory (default: ~/.argos-daemon)
  --web               Serve the web UI (uses --web-root, ./web, ../../apps/desktop/out/web, or exe-dir/web)
  --web-root <path>   Web asset directory containing index.html
  --pair              Generate a one-time pairing token and print the URL
  --log-level <level> Log level: debug, info, warn, error (default: info)
  --no-update-check   Skip the startup update-available check
  -h, --help          Show this help

Update options:
  --install-dir <path>  Install directory to update (default: location of this binary)
  --token <token>       GitHub API token (optional, raises rate limits)

Environment variables:
  ARGOS_HOST           Same as --host
  ARGOS_PORT           Same as --port
  ARGOS_DATA_DIR       Same as --data-dir
  ARGOS_DESKTOP_BOOTSTRAP  Desktop bootstrap secret (set by Electron main)
  ARGOS_WEB            Same as --web (1/true)
  ARGOS_WEB_ROOT       Same as --web-root
  ARGOS_LOG_LEVEL      Same as --log-level
  ARGOS_NO_UPDATE_CHECK  Same as --no-update-check
`);
    process.exit(0);
  }

  const parsed = parseArgs(process.argv);
  const opts = mergeOptions(parsed, process.env);

  if (opts.logLevel) {
    logger.setLevel(opts.logLevel as any);
  }

  if (isNonLoopbackHost(opts.host || "127.0.0.1") && !opts.desktopBootstrap) {
    logger.warn(`[daemon] Non-loopback host "${opts.host}" without ARGOS_DESKTOP_BOOTSTRAP.`);
    logger.warn(`[daemon] Non-loopback requests will be rejected until pairing/session auth is available.`);
  }

  startDaemon({
    dataDir: opts.dataDir,
    host: opts.host,
    port: opts.port,
    desktopBootstrapSecret: opts.desktopBootstrap,
    web: opts.web,
    webRoot: opts.webRoot,
    pair: opts.pair,
    noUpdateCheck: opts.noUpdateCheck,
  }).catch((error) => {
    logger.error("[daemon] Failed to start:", error);
    process.exit(1);
  });
}

if (import.meta.main) {
  void runDaemonCli();
}
