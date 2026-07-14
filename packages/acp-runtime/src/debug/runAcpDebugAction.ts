import { methods as acpMethods } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";
import { nanoid } from "nanoid";
import { resolveAcpAgentAlias } from "@argos/backend-core";
import { isAuthRequiredError } from "../protocol/acpCapabilities";
import { fingerprintMessage } from "../session/acpMessageFingerprint";
import type {
  AcpAgentDiagnostics,
  AcpDebugEventEntry,
  AcpDebugRequest,
  AcpDebugRunResult,
} from "@argos/shared/presenter";
import type { AcpProcessManager, AcpProcessHandle } from "../process/acpProcessManager";
import type { AcpSessionManager } from "../session/acpSessionManager";
import type { AcpSessionPersistence } from "../session/acpSessionPersistence";

type AcpSetSessionModelRequest = { sessionId: string; modelId: string };

async function setSessionModelCompat(_connection: unknown, _params: AcpSetSessionModelRequest): Promise<unknown> {
  throw new Error("[ACP] Session model selection is not supported by this SDK connection.");
}

/**
 * Shared dependencies required to drive an ACP debug action against a live
 * agent connection. Both the desktop provider and the headless daemon supply
 * these from their own `AcpRuntime`, keeping the protocol switch in one place.
 */
export interface RunAcpDebugActionDeps {
  request: AcpDebugRequest;
  provider: { id: string };
  getAcpAgents: () => Promise<Array<{ id: string; name: string }>>;
  processManager: AcpProcessManager;
  sessionManager?: Pick<AcpSessionManager, "resolveMcpServersForAgent">;
  sessionPersistence?: Pick<
    AcpSessionPersistence,
    "syncRemoteSessions" | "isWorkdirUsable" | "resolveWorkdir" | "saveSessionData" | "getSessionData"
  >;
  sqlitePresenter?: { createConversation: (title: string, settings?: Record<string, unknown>) => Promise<string> };
  toConnectionRef: (handle: AcpProcessHandle) => unknown;
  onEvent?: (event: AcpDebugEventEntry) => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const healthCheckFlights = new WeakMap<AcpProcessManager, Map<string, Promise<AcpDebugRunResult>>>();

const getHealthCheckKey = (request: AcpDebugRequest): string =>
  `${resolveAcpAgentAlias(request.agentId)}::${request.workdir?.trim() ?? ""}`;

/**
 * Execute a single ACP debug/lifecycle action (initialize, authenticate,
 * logout, session list/resume/close/fork, prompt, etc.) against a live agent
 * connection resolved from the shared process manager. Host-agnostic: event
 * forwarding is delegated to `deps.onEvent`.
 */
export function runAcpDebugAction(deps: RunAcpDebugActionDeps): Promise<AcpDebugRunResult> {
  if (deps.request.action !== "healthCheck") {
    return executeAcpDebugAction(deps);
  }

  let managerFlights = healthCheckFlights.get(deps.processManager);
  if (!managerFlights) {
    managerFlights = new Map();
    healthCheckFlights.set(deps.processManager, managerFlights);
  }

  const key = getHealthCheckKey(deps.request);
  const existing = managerFlights.get(key);
  if (existing) {
    return existing;
  }

  const flight = executeAcpDebugAction(deps).finally(() => {
    if (managerFlights?.get(key) === flight) {
      managerFlights.delete(key);
    }
  });
  managerFlights.set(key, flight);
  return flight;
}

async function executeAcpDebugAction(deps: RunAcpDebugActionDeps): Promise<AcpDebugRunResult> {
  const {
    request,
    provider,
    processManager,
    sessionManager,
    sessionPersistence,
    sqlitePresenter,
    toConnectionRef,
    onEvent,
  } = deps;
  const resolvedAgentId = resolveAcpAgentAlias(request.agentId);
  const agent = (await deps.getAcpAgents()).find((item) => item.id === resolvedAgentId);
  if (!agent) {
    throw new Error(`[ACP] Agent not found: ${request.agentId}`);
  }

  let handle: AcpProcessHandle;
  try {
    handle = await processManager.getConnection(agent as never, request.workdir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("shutting down")) {
      return {
        status: "error",
        sessionId: undefined,
        error: "Process manager is shutting down",
        events: [],
      };
    }
    throw error;
  }

  const connection = handle.connection;
  const events: AcpDebugEventEntry[] =
    typeof processManager.getDebugEvents === "function" ? [...processManager.getDebugEvents(agent.id)] : [];

  const pushEvent = (entry: Omit<AcpDebugEventEntry, "id" | "timestamp" | "agentId">): void => {
    const record: AcpDebugEventEntry = processManager.appendDebugEvent?.(agent.id, entry) ?? {
      ...entry,
      id: nanoid(),
      timestamp: Date.now(),
      agentId: agent.id,
    };
    events.push(record);
    onEvent?.(record);
  };

  let activeSessionId =
    request.sessionId ??
    (isPlainObject(request.payload) && typeof request.payload.sessionId === "string"
      ? (request.payload.sessionId as string)
      : undefined);

  let disposeNotification: (() => void) | undefined;
  let disposePermission: (() => void) | undefined;

  const attachSession = (sessionId: string) => {
    if (disposeNotification) {
      disposeNotification();
      disposeNotification = undefined;
    }
    if (disposePermission) {
      disposePermission();
      disposePermission = undefined;
    }

    disposeNotification = processManager.registerSessionListener(agent.id, sessionId, (notification) => {
      pushEvent({
        kind: "notification",
        action: "session/update",
        sessionId,
        payload: notification,
      });
    });
    disposePermission = processManager.registerPermissionResolver(agent.id, sessionId, async (params) => {
      pushEvent({
        kind: "permission",
        action: "requestPermission",
        sessionId,
        payload: params,
      });
      return { outcome: { outcome: "cancelled" } };
    });
  };

  const resolveHandleWorkdir = (): string => {
    const handleWorkdir = handle.workdir?.trim();
    if (
      handleWorkdir &&
      (!sessionPersistence ||
        typeof sessionPersistence.isWorkdirUsable !== "function" ||
        sessionPersistence.isWorkdirUsable(handleWorkdir))
    ) {
      return handleWorkdir;
    }
    const requestedWorkdir = request.workdir?.trim();
    if (sessionPersistence && typeof sessionPersistence.resolveWorkdir === "function") {
      return sessionPersistence.resolveWorkdir(requestedWorkdir);
    }
    return requestedWorkdir || process.cwd();
  };

  const normalizeWorkdir = (workdir?: string | null): string => {
    const fallback = resolveHandleWorkdir();
    const trimmed = workdir?.trim();
    if (!trimmed) {
      return fallback;
    }
    if (
      sessionPersistence &&
      typeof sessionPersistence.isWorkdirUsable === "function" &&
      !sessionPersistence.isWorkdirUsable(trimmed)
    ) {
      return fallback;
    }
    if (sessionPersistence && typeof sessionPersistence.resolveWorkdir === "function") {
      return sessionPersistence.resolveWorkdir(trimmed);
    }
    return trimmed;
  };

  const resolveWorkdir = (): string => {
    return resolveHandleWorkdir();
  };

  const resolvePayloadWorkdir = (workdir: unknown): string | undefined => {
    if (typeof workdir !== "string" || !workdir.trim()) {
      return undefined;
    }
    return normalizeWorkdir(workdir);
  };

  const resolveMcpServers = async (): Promise<schema.McpServer[]> => {
    if (typeof sessionManager?.resolveMcpServersForAgent !== "function") {
      return [];
    }
    return sessionManager.resolveMcpServersForAgent(agent.id, handle.mcpCapabilities);
  };

  try {
    switch (request.action) {
      case "initialize": {
        pushEvent({
          kind: "lifecycle",
          action: "initialize",
          sessionId: activeSessionId,
          message: "Connection is already initialized by the ACP runtime.",
          payload: toConnectionRef(handle),
        });
        break;
      }
      case "healthCheck": {
        const body: schema.NewSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: [],
        };
        pushEvent({
          kind: "request",
          action: "healthCheck/session/new",
          payload: body,
        });
        const response = await connection.agent.request(acpMethods.agent.session.new, body);
        if (!response.sessionId) {
          throw new Error("ACP health check did not return a session ID");
        }

        activeSessionId = response.sessionId;
        pushEvent({
          kind: "response",
          action: "healthCheck/session/new",
          sessionId: activeSessionId,
          payload: response,
        });

        try {
          if (handle.supportsSessionClose) {
            pushEvent({
              kind: "request",
              action: "healthCheck/session/close",
              sessionId: activeSessionId,
              payload: { sessionId: activeSessionId },
            });
            const closeResponse = await connection.agent.request(acpMethods.agent.session.close, {
              sessionId: activeSessionId,
            });
            pushEvent({
              kind: "response",
              action: "healthCheck/session/close",
              sessionId: activeSessionId,
              payload: closeResponse,
            });
          }
        } catch (cleanupError) {
          pushEvent({
            kind: "lifecycle",
            action: "healthCheck/cleanup",
            sessionId: activeSessionId,
            message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        } finally {
          processManager.clearSession(activeSessionId);
          activeSessionId = undefined;
        }
        break;
      }
      case "authenticate": {
        const methodId =
          isPlainObject(request.payload) && typeof request.payload.methodId === "string"
            ? request.payload.methodId
            : undefined;
        if (!methodId) {
          throw new Error("methodId is required for authenticate");
        }
        const body: schema.AuthenticateRequest = { methodId };
        if (isPlainObject(request.payload?._meta)) {
          body._meta = request.payload._meta;
        }
        pushEvent({ kind: "request", action: "authenticate", payload: body });
        const response = await connection.agent.request(acpMethods.agent.authenticate, body);
        pushEvent({
          kind: "response",
          action: "authenticate",
          sessionId: activeSessionId,
          payload: response ?? {},
        });
        break;
      }
      case "logout": {
        if (!handle.supportsAuthLogout) {
          throw new Error("Agent did not advertise auth.logout capability");
        }
        const body: schema.LogoutRequest = {};
        if (isPlainObject(request.payload?._meta)) {
          body._meta = request.payload._meta as schema.LogoutRequest["_meta"];
        }
        pushEvent({ kind: "request", action: "logout", payload: body });
        const response = await connection.agent.request(acpMethods.agent.logout, body);
        pushEvent({
          kind: "response",
          action: "logout",
          sessionId: activeSessionId,
          payload: response ?? {},
        });
        break;
      }
      case "newSession": {
        const basePayload: schema.NewSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: await resolveMcpServers(),
        };
        const body = { ...basePayload };
        if (isPlainObject(request.payload)) {
          const payloadWorkdir = resolvePayloadWorkdir(request.payload.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (Array.isArray(request.payload.mcpServers)) {
            body.mcpServers = request.payload.mcpServers as schema.McpServer[];
          }
          if (isPlainObject(request.payload._meta)) {
            body._meta = request.payload._meta;
          }
        }
        pushEvent({ kind: "request", action: "newSession", payload: body });
        const response = await connection.agent.request(acpMethods.agent.session.new, body);
        activeSessionId = response.sessionId;
        processManager.registerSessionWorkdir(activeSessionId, body.cwd);
        attachSession(activeSessionId);
        pushEvent({
          kind: "response",
          action: "newSession",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "loadSession": {
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionFromPayload =
          payloadOverrides && typeof payloadOverrides.sessionId === "string" ? payloadOverrides.sessionId : undefined;
        const sessionToLoad = sessionFromPayload ?? activeSessionId;
        if (!sessionToLoad || typeof sessionToLoad !== "string") {
          throw new Error("Session ID is required for loadSession");
        }
        const body: schema.LoadSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: await resolveMcpServers(),
          sessionId: sessionToLoad,
        };
        if (payloadOverrides) {
          const payloadWorkdir = resolvePayloadWorkdir(payloadOverrides.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (Array.isArray(payloadOverrides.mcpServers)) {
            body.mcpServers = payloadOverrides.mcpServers as schema.McpServer[];
          }
          if (isPlainObject(payloadOverrides._meta)) {
            body._meta = payloadOverrides._meta;
          }
        }
        pushEvent({
          kind: "request",
          action: "loadSession",
          sessionId: sessionToLoad,
          payload: body,
        });
        processManager.registerSessionWorkdir(sessionToLoad, body.cwd);
        attachSession(sessionToLoad);
        const response = await connection.agent.request(acpMethods.agent.session.load, body);
        activeSessionId = sessionToLoad;
        pushEvent({
          kind: "response",
          action: "loadSession",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "sessionList": {
        if (!handle.supportsSessionList) {
          throw new Error("Agent did not advertise sessionCapabilities.list");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const body: schema.ListSessionsRequest = {
          cwd: resolveWorkdir(),
        };
        if (payloadOverrides) {
          const payloadWorkdir = resolvePayloadWorkdir(payloadOverrides.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (typeof payloadOverrides.cursor === "string") {
            body.cursor = payloadOverrides.cursor;
          }
          if (isPlainObject(payloadOverrides._meta)) {
            body._meta = payloadOverrides._meta;
          }
        }
        const shouldSyncRemoteSessions = Boolean(payloadOverrides?.sync);
        const allSessions: schema.SessionInfo[] = [];
        let cursor: string | null | undefined = body.cursor;
        do {
          const pageBody = { ...body, cursor };
          pushEvent({ kind: "request", action: "session/list", payload: pageBody });
          const response = await connection.agent.request(acpMethods.agent.session.list, pageBody);
          allSessions.push(...response.sessions);
          cursor = response.nextCursor;
          pushEvent({
            kind: "response",
            action: "session/list",
            payload: response,
          });
        } while (cursor);
        pushEvent({
          kind: "lifecycle",
          action: "session/list.complete",
          payload: { count: allSessions.length },
        });
        if (shouldSyncRemoteSessions) {
          if (typeof sessionPersistence?.syncRemoteSessions !== "function") {
            throw new Error("Session persistence does not support remote session sync");
          }
          const syncResult = await sessionPersistence.syncRemoteSessions({
            agentId: agent.id,
            agentName: agent.name,
            providerId: provider.id,
            workdir: body.cwd ?? resolveWorkdir(),
            sessions: allSessions,
          });
          pushEvent({
            kind: "lifecycle",
            action: "session/list.sync",
            payload: syncResult,
          });
        }
        break;
      }
      case "sessionResume": {
        if (!handle.supportsSessionResume) {
          throw new Error("Agent did not advertise sessionCapabilities.resume");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToResume =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToResume) {
          throw new Error("sessionId is required for sessionResume");
        }
        const body: schema.ResumeSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: await resolveMcpServers(),
          sessionId: sessionToResume,
        };
        if (payloadOverrides) {
          const payloadWorkdir = resolvePayloadWorkdir(payloadOverrides.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (Array.isArray(payloadOverrides.mcpServers)) {
            body.mcpServers = payloadOverrides.mcpServers as schema.McpServer[];
          }
          if (isPlainObject(payloadOverrides._meta)) {
            body._meta = payloadOverrides._meta;
          }
        }
        pushEvent({
          kind: "request",
          action: "session/resume",
          sessionId: sessionToResume,
          payload: body,
        });
        processManager.registerSessionWorkdir(sessionToResume, body.cwd);
        attachSession(sessionToResume);
        const response = await connection.agent.request(acpMethods.agent.session.resume, body);
        activeSessionId = sessionToResume;
        pushEvent({
          kind: "response",
          action: "session/resume",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "sessionClose": {
        if (!handle.supportsSessionClose) {
          throw new Error("Agent did not advertise sessionCapabilities.close");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToClose =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToClose) {
          throw new Error("sessionId is required for sessionClose");
        }
        const body: schema.CloseSessionRequest = { sessionId: sessionToClose };
        if (payloadOverrides && isPlainObject(payloadOverrides._meta)) {
          body._meta = payloadOverrides._meta;
        }
        pushEvent({
          kind: "request",
          action: "session/close",
          sessionId: sessionToClose,
          payload: body,
        });
        const response = await connection.agent.request(acpMethods.agent.session.close, body);
        processManager.clearSession(sessionToClose);
        activeSessionId = undefined;
        pushEvent({
          kind: "response",
          action: "session/close",
          sessionId: sessionToClose,
          payload: response,
        });
        break;
      }
      case "sessionFork": {
        if (!handle.supportsSessionFork) {
          throw new Error("Agent did not advertise sessionCapabilities.fork");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToFork =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToFork) {
          throw new Error("sessionId is required for sessionFork");
        }
        const body: schema.ForkSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: await resolveMcpServers(),
          sessionId: sessionToFork,
        };
        if (payloadOverrides) {
          const payloadWorkdir = resolvePayloadWorkdir(payloadOverrides.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (Array.isArray(payloadOverrides.mcpServers)) {
            body.mcpServers = payloadOverrides.mcpServers as schema.McpServer[];
          }
        }
        if (payloadOverrides && isPlainObject(payloadOverrides._meta)) {
          body._meta = payloadOverrides._meta;
        }
        pushEvent({
          kind: "request",
          action: "session/fork",
          sessionId: sessionToFork,
          payload: body,
        });
        const response = await connection.agent.request(acpMethods.agent.session.fork, body);
        activeSessionId = response.sessionId;
        processManager.registerSessionWorkdir(activeSessionId, body.cwd);
        attachSession(activeSessionId);
        pushEvent({
          kind: "response",
          action: "session/fork",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "sessionImport": {
        if (!handle.supportsLoadSession) {
          throw new Error("Agent did not advertise loadSession capability");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToImport =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToImport) {
          throw new Error("sessionId is required for sessionImport");
        }
        const body: schema.LoadSessionRequest = {
          cwd: resolveWorkdir(),
          mcpServers: await resolveMcpServers(),
          sessionId: sessionToImport,
        };
        if (payloadOverrides) {
          const payloadWorkdir = resolvePayloadWorkdir(payloadOverrides.cwd);
          if (payloadWorkdir) {
            body.cwd = payloadWorkdir;
          }
          if (Array.isArray(payloadOverrides.mcpServers)) {
            body.mcpServers = payloadOverrides.mcpServers as schema.McpServer[];
          }
        }
        const conversationId =
          payloadOverrides && typeof payloadOverrides.conversationId === "string"
            ? payloadOverrides.conversationId
            : undefined;
        const effectiveConversationId =
          conversationId ??
          (typeof sqlitePresenter?.createConversation === "function"
            ? await sqlitePresenter.createConversation(`ACP import ${sessionToImport}`, {
                providerId: provider.id,
                modelId: agent.id,
                chatMode: "acp agent",
                agentWorkspacePath: body.cwd,
                acpWorkdirMap: { [agent.id]: body.cwd },
              })
            : undefined);
        if (!effectiveConversationId) {
          throw new Error("conversationId is required for sessionImport and auto-create is unavailable");
        }
        const importedConversationId = effectiveConversationId;
        pushEvent({
          kind: "request",
          action: "session/import",
          sessionId: sessionToImport,
          payload: body,
        });
        // Register a staging collector BEFORE the load so replayed
        // session/update notifications are captured (not lost to the buffer).
        // After load, the captured content is fingerprinted and persisted as
        // conversation metadata so repeated imports do not duplicate.
        const stagedNotifications: schema.SessionNotification[] = [];
        const disposeStaging = processManager.registerSessionListener(agent.id, sessionToImport, (notification) => {
          stagedNotifications.push(notification);
        });
        let loadResponse: schema.LoadSessionResponse;
        try {
          loadResponse = await connection.agent.request(acpMethods.agent.session.load, body);
        } finally {
          disposeStaging();
        }
        // Compute fingerprints for the staged replay content.
        const replayFingerprints = stagedNotifications.map((notification) =>
          fingerprintMessage({
            role: notification.update.sessionUpdate,
            content: JSON.stringify(notification.update),
          }),
        );
        processManager.registerSessionWorkdir(sessionToImport, body.cwd, importedConversationId);
        attachSession(sessionToImport);
        activeSessionId = sessionToImport;
        if (typeof sessionPersistence?.saveSessionData === "function") {
          const existing = await sessionPersistence.getSessionData(importedConversationId, agent.id);
          const replay = (existing?.metadata as { replay?: { fingerprints?: unknown[] } } | undefined)?.replay;
          const previousFingerprints = Array.isArray(replay?.fingerprints)
            ? replay.fingerprints.filter((fingerprint): fingerprint is string => typeof fingerprint === "string")
            : [];
          const newFingerprints = replayFingerprints.filter((fp) => !previousFingerprints.includes(fp));
          await sessionPersistence.saveSessionData(
            importedConversationId,
            agent.id,
            sessionToImport,
            body.cwd,
            "idle",
            {
              importedAt: new Date().toISOString(),
              source: "session/import",
              replay: {
                notificationCount: stagedNotifications.length,
                fingerprints: [...previousFingerprints, ...newFingerprints],
              },
            },
          );
        }
        if (stagedNotifications.length > 0) {
          pushEvent({
            kind: "lifecycle",
            action: "session/import.replay",
            sessionId: sessionToImport,
            payload: {
              stagedNotificationCount: stagedNotifications.length,
              fingerprintCount: replayFingerprints.length,
            },
          });
        }
        pushEvent({
          kind: "response",
          action: "session/import",
          sessionId: sessionToImport,
          payload: loadResponse ?? {},
        });
        break;
      }
      case "sessionDetach": {
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToDetach =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToDetach) {
          throw new Error("sessionId is required for sessionDetach");
        }
        // Detach is a local-only unlink: drop the Argos<->remote link without
        // issuing any remote `session/close`. The remote session stays alive.
        processManager.clearSession(sessionToDetach);
        if (activeSessionId === sessionToDetach) {
          activeSessionId = undefined;
        }
        pushEvent({
          kind: "lifecycle",
          action: "session/detach",
          sessionId: sessionToDetach,
          message: "Detached local conversation from remote ACP session without remote write.",
        });
        break;
      }
      case "sessionCloseRemote": {
        if (!handle.supportsSessionClose) {
          throw new Error("Agent did not advertise sessionCapabilities.close");
        }
        const payloadOverrides = isPlainObject(request.payload) ? request.payload : undefined;
        const sessionToClose =
          payloadOverrides && typeof payloadOverrides.sessionId === "string"
            ? payloadOverrides.sessionId
            : activeSessionId;
        if (!sessionToClose) {
          throw new Error("sessionId is required for sessionCloseRemote");
        }
        const body: schema.CloseSessionRequest = { sessionId: sessionToClose };
        if (payloadOverrides && isPlainObject(payloadOverrides._meta)) {
          body._meta = payloadOverrides._meta;
        }
        pushEvent({
          kind: "request",
          action: "session/closeRemote",
          sessionId: sessionToClose,
          payload: body,
        });
        const response = await connection.agent.request(acpMethods.agent.session.close, body);
        processManager.clearSession(sessionToClose);
        if (activeSessionId === sessionToClose) {
          activeSessionId = undefined;
        }
        pushEvent({
          kind: "response",
          action: "session/closeRemote",
          sessionId: sessionToClose,
          payload: response,
        });
        break;
      }
      case "prompt": {
        if (!activeSessionId) {
          throw new Error("Session ID is required for prompt");
        }
        const body = isPlainObject(request.payload)
          ? { ...request.payload, sessionId: activeSessionId }
          : { sessionId: activeSessionId, prompt: [] };
        pushEvent({
          kind: "request",
          action: "prompt",
          sessionId: activeSessionId,
          payload: body,
        });
        attachSession(activeSessionId);
        const response = await connection.agent.request(acpMethods.agent.session.prompt, body as schema.PromptRequest);
        pushEvent({
          kind: "response",
          action: "prompt",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "cancel": {
        if (!activeSessionId) {
          throw new Error("Session ID is required for cancel");
        }
        const body = isPlainObject(request.payload)
          ? { ...request.payload, sessionId: activeSessionId }
          : { sessionId: activeSessionId };
        pushEvent({
          kind: "request",
          action: "cancel",
          sessionId: activeSessionId,
          payload: body,
        });
        attachSession(activeSessionId);
        await connection.agent.notify(acpMethods.agent.session.cancel, body as schema.CancelNotification);
        pushEvent({
          kind: "response",
          action: "cancel",
          sessionId: activeSessionId,
          payload: { ok: true },
        });
        break;
      }
      case "setSessionMode": {
        if (!activeSessionId) {
          throw new Error("Session ID is required for setSessionMode");
        }
        const body = isPlainObject(request.payload)
          ? { ...request.payload, sessionId: activeSessionId }
          : { sessionId: activeSessionId, modeId: "default" };
        pushEvent({
          kind: "request",
          action: "setSessionMode",
          sessionId: activeSessionId,
          payload: body,
        });
        attachSession(activeSessionId);
        const response = await connection.agent.request(
          acpMethods.agent.session.setMode,
          body as schema.SetSessionModeRequest,
        );
        pushEvent({
          kind: "response",
          action: "setSessionMode",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "setSessionModel": {
        if (!activeSessionId) {
          throw new Error("Session ID is required for setSessionModel");
        }
        const body = isPlainObject(request.payload)
          ? { ...request.payload, sessionId: activeSessionId }
          : { sessionId: activeSessionId };
        pushEvent({
          kind: "request",
          action: "setSessionModel",
          sessionId: activeSessionId,
          payload: body,
        });
        attachSession(activeSessionId);
        const response = await setSessionModelCompat(connection, body as AcpSetSessionModelRequest);
        pushEvent({
          kind: "response",
          action: "setSessionModel",
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "extMethod": {
        const method = request.methodName?.trim();
        if (!method) {
          throw new Error("Custom method name is required for extMethod");
        }
        const body = isPlainObject(request.payload) ? request.payload : {};
        pushEvent({ kind: "request", action: `ext:${method}`, payload: body });
        const response = await connection.agent.request(method, body);
        pushEvent({
          kind: "response",
          action: `ext:${method}`,
          sessionId: activeSessionId,
          payload: response,
        });
        break;
      }
      case "extNotification": {
        const method = request.methodName?.trim();
        if (!method) {
          throw new Error("Custom method name is required for extNotification");
        }
        const body = isPlainObject(request.payload) ? request.payload : {};
        pushEvent({ kind: "request", action: `ext:${method}`, payload: body });
        await connection.agent.notify(method, body);
        pushEvent({
          kind: "response",
          action: `ext:${method}`,
          sessionId: activeSessionId,
          payload: { ok: true },
        });
        break;
      }
      default:
        throw new Error(`Unsupported ACP debug action: ${request.action}`);
    }

    return {
      status: "ok",
      sessionId: activeSessionId,
      events,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
    pushEvent({
      kind: "error",
      action: request.action,
      sessionId: activeSessionId,
      message,
      payload: error instanceof Error ? { name: error.name, stack: error.stack } : error,
    });
    return {
      status: "error",
      sessionId: activeSessionId,
      error: message,
      events,
    };
  } finally {
    disposeNotification?.();
    disposePermission?.();
  }
}

/**
 * Compute an `AcpAgentDiagnostics` snapshot from the current process manager
 * state for a given agent. Host-agnostic; both desktop and daemon reuse it.
 */
export function computeAcpDiagnostics(
  processManager: AcpProcessManager,
  agentId: string,
  workdir?: string | null,
): AcpAgentDiagnostics {
  const handle = processManager
    .listProcesses()
    .find((candidate) => candidate.agentId === agentId && (!workdir || candidate.workdir === workdir));
  const snapshot = handle?.capabilitySnapshot;
  const authMethods = (handle?.authMethods ?? []).map((method) => {
    const untyped = method as { name?: unknown; type?: unknown; vars?: unknown; link?: unknown };
    const nameValue = typeof untyped.name === "string" ? untyped.name : undefined;
    const typeValue = typeof untyped.type === "string" ? untyped.type : undefined;
    const base: {
      id: string;
      name?: string;
      type?: string;
      vars?: Array<{ name: string; label?: string; secret?: boolean; optional?: boolean }>;
      link?: string | null;
    } = {
      id: method.id,
      name: nameValue,
      type: typeValue,
    };
    if (typeValue === "env_var") {
      if (Array.isArray(untyped.vars)) {
        base.vars = untyped.vars.map((entry) => {
          const variable = entry as { name?: unknown; label?: unknown; secret?: unknown; optional?: unknown };
          return {
            name: typeof variable.name === "string" ? variable.name : "",
            label: typeof variable.label === "string" ? variable.label : undefined,
            secret: variable.secret !== false,
            optional: Boolean(variable.optional),
          };
        });
      }
      if (typeof untyped.link === "string") {
        base.link = untyped.link;
      }
    }
    return base;
  });
  const debugEvents = processManager.getDebugEvents(agentId);
  const lastOperationalSuccess = [...debugEvents]
    .reverse()
    .find(
      (entry) =>
        entry.kind === "response" && ["healthCheck/session/new", "session/new", "newSession"].includes(entry.action),
    );
  const lastErrorEntry = [...debugEvents]
    .reverse()
    .find(
      (entry) =>
        entry.kind === "error" &&
        ["healthCheck", "session/initialize", "initialize", "process.error"].includes(entry.action) &&
        (!lastOperationalSuccess || entry.timestamp >= lastOperationalSuccess.timestamp),
    );
  const ready = handle?.status === "ready" && Boolean(lastOperationalSuccess) && !lastErrorEntry;
  const lastErrorMessage =
    lastErrorEntry?.message ?? (lastErrorEntry?.payload as { message?: string } | undefined)?.message ?? null;
  const authErrorMessage =
    lastErrorEntry && isAuthRequiredError(lastErrorEntry.payload ?? lastErrorEntry.message) ? lastErrorMessage : null;

  return {
    ready,
    agentId,
    workdir: handle?.workdir ?? null,
    launchSource: handle?.launchFingerprint ?? null,
    protocolVersion: snapshot?.protocolVersion != null ? String(snapshot.protocolVersion) : undefined,
    agentName: snapshot?.agentInfo?.name,
    agentVersion: snapshot?.agentInfo?.version != null ? String(snapshot?.agentInfo?.version) : undefined,
    authMethods,
    authRequired: Boolean(authErrorMessage),
    authRequiredMessage: authErrorMessage,
    capabilities: {
      loadSession: handle?.supportsLoadSession ?? false,
      sessionList: handle?.supportsSessionList ?? false,
      sessionResume: handle?.supportsSessionResume ?? false,
      sessionClose: handle?.supportsSessionClose ?? false,
      sessionFork: handle?.supportsSessionFork ?? false,
      authLogout: handle?.supportsAuthLogout ?? false,
      // The ACP runtime always declares fs + terminal client capabilities.
      fs: true,
      terminal: true,
    },
    lastError: typeof lastErrorMessage === "string" ? lastErrorMessage : null,
  };
}
