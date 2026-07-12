/**
 * Host-injected ports for the ACP runtime.
 *
 * The runtime consumes only this seam and must never import `electron`,
 * `#/eventbus`, `#/routes`, `#/lib/runtimeHelper`, or any desktop presenter.
 * Each host (desktop Electron, headless daemon) supplies its own implementation.
 */

/** Filesystem and app-metadata paths (replaces `app.getPath` / `app.getVersion`). */
export interface HostPathsPort {
  tempDir(): string;
  homeDir(): string;
  userDataDir(): string;
  appVersion(): string;
  /** Application bundle root. Optional (desktop only). */
  appPath?(): string;
}

/**
 * Resolves bundled runtime commands and prepares spawn environments.
 * Replaces the Electron-coupled `RuntimeHelper` singleton.
 */
export interface RuntimePort {
  initializeRuntimes?(): void;
  /** Expand `~` and runtime-prefixed paths. */
  expandPath(target: string): string;
  /** Swap a bare command (npx/npm/node/uvx) for the bundled bin when enabled. */
  resolveCommand(command: string, useBundled: boolean, checkExists: boolean): string;
  /** Prepend bundled runtime dirs to PATH in the spawn env. */
  buildSpawnEnv(base: Record<string, string>): Record<string, string>;
}

/** Host lifecycle hooks (replaces `app.on("before-quit")`). */
export interface LifecyclePort {
  onBeforeQuit(cb: () => void): void;
}

/**
 * Binary-file read gating for `fs/read_text_file`. Replaces
 * `#/lib/binaryReadGuard` (which depends on the desktop file/mime subsystem).
 */
export interface AcpFsHelpers {
  shouldRejectAcpTextRead(filePath: string): Promise<{ reject: boolean; mimeType?: string }>;
  buildBinaryReadGuidance(filePath: string, mimeType: string | undefined, source: string): string;
}

/**
 * Event publication. The desktop adapter maps these to `eventBus` /
 * `publishArgosEvent`; the daemon adapter publishes over WebSocket.
 */
export interface AcpEventPort {
  /** Broadcast to renderer windows only (desktop `eventBus.sendToRenderer`). */
  broadcast(channel: string, payload: unknown): void;
  /** Broadcast to both main and renderer (desktop `eventBus.send`). */
  broadcastToAll(channel: string, payload: unknown): void;
  /** Typed ArgosEvent contract publication (renderer-facing, WS-capable). */
  publish(eventName: string, payload: unknown): void;
}

/** MCP registry resolution injected into spawned agents. */
export interface McpRuntimePort {
  getNpmRegistry?: () => Promise<string | null>;
  getUvRegistry?: () => Promise<string | null>;
}

/** Aggregate host ports consumed by the ACP runtime. */
export interface AcpHostPorts {
  paths: HostPathsPort;
  runtime: RuntimePort;
  events: AcpEventPort;
  lifecycle: LifecyclePort;
  fs: AcpFsHelpers;
  mcp?: McpRuntimePort;
}
