import type * as schema from "@agentclientprotocol/sdk";

export interface AcpCapabilityOptions {
  enableFs?: boolean;
  enableTerminal?: boolean;
  enableTerminalAuth?: boolean;
}

export interface AcpCapabilitySupport {
  loadSession: boolean;
  sessionList: boolean;
  sessionResume: boolean;
  sessionClose: boolean;
  sessionFork: boolean;
  authLogout: boolean;
}

export interface AcpCapabilitySnapshot {
  protocolVersion?: schema.ProtocolVersion;
  agentInfo?: schema.Implementation | null;
  agentCapabilities?: schema.AgentCapabilities;
  sessionCapabilities?: schema.SessionCapabilities;
  promptCapabilities?: schema.PromptCapabilities;
  authMethods: schema.AuthMethod[];
  mcpCapabilities?: schema.McpCapabilities;
  supports: AcpCapabilitySupport;
}

export function buildCapabilitySnapshot(initializeResult: schema.InitializeResponse): AcpCapabilitySnapshot {
  const agentCapabilities = initializeResult.agentCapabilities;
  const sessionCapabilities = agentCapabilities?.sessionCapabilities;

  return {
    protocolVersion: initializeResult.protocolVersion,
    agentInfo: initializeResult.agentInfo,
    agentCapabilities,
    sessionCapabilities,
    promptCapabilities: agentCapabilities?.promptCapabilities,
    authMethods: initializeResult.authMethods ?? [],
    mcpCapabilities: agentCapabilities?.mcpCapabilities,
    supports: {
      loadSession: Boolean(agentCapabilities?.loadSession),
      sessionList: Boolean(sessionCapabilities?.list),
      sessionResume: Boolean(sessionCapabilities?.resume),
      sessionClose: Boolean(sessionCapabilities?.close),
      sessionFork: Boolean(sessionCapabilities?.fork),
      authLogout: Boolean(agentCapabilities?.auth?.logout),
    },
  };
}

/**
 * Build client capabilities object for ACP initialization.
 *
 * This determines what features the client (Argos) advertises to the agent.
 * Agents use these capabilities to decide which operations to request.
 */
export function buildClientCapabilities(options: AcpCapabilityOptions = {}): schema.ClientCapabilities {
  const caps: schema.ClientCapabilities = {};

  if (options.enableFs !== false) {
    caps.fs = {
      readTextFile: true,
      writeTextFile: true,
    };
  }

  if (options.enableTerminal !== false) {
    caps.terminal = true;
  }

  if (options.enableTerminal !== false && options.enableTerminalAuth) {
    caps.auth = {
      terminal: true,
    };
  }

  return caps;
}

/**
 * ACP agents report authentication failures through JSON-RPC error codes.
 * `-32042` is the ACP "authentication required" code; `-32800` is a custom
 * auth-related code some agents use. We also treat any error whose message
 * clearly references authentication as auth-required so the renderer can show
 * a safe, actionable status instead of a raw stack trace.
 */
export const ACP_AUTH_REQUIRED_ERROR_CODES = new Set<number>([-32042, -32800]);

export function isAuthRequiredError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number" && ACP_AUTH_REQUIRED_ERROR_CODES.has(code)) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : typeof error === "string"
          ? error
          : "";
  if (!message) return false;
  return /\b(authentication|authenticate|unauthorized|not authorized|login required|auth token|missing credential)\b/i.test(
    message,
  );
}

/**
 * Determine whether the client should advertise `auth.terminal` support.
 *
 * Per ACP, the client must only declare `auth.terminal=true` after it is able
 * to run an interactive terminal auth flow. We gate it on the advertised auth
 * methods containing a `terminal` method so we never promise a flow we cannot
 * surface.
 */
export function clientSupportsTerminalAuth(authMethods: ReadonlyArray<unknown> | undefined): boolean {
  if (!Array.isArray(authMethods)) return false;
  return authMethods.some(
    (method) => Boolean(method) && typeof method === "object" && (method as { type?: unknown }).type === "terminal",
  );
}
