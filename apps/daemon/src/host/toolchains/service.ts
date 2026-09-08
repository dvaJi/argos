import { existsSync, rmSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import type { ToolchainName, ToolchainSource, ToolchainStatus } from "@argos/shared-contracts/routes";
import { NODE_PIN, UV_PIN, pinFor } from "./catalog";
import { installToolchain, ToolchainInstallError } from "./install";
import { binDirFor, bundledToolPath, resolveDerivedToolchain, systemToolPath } from "./locate";
import { loadState, saveState } from "./state";
import type { InstallProgress, ResolvedToolchain, ToolchainSourceEntry, ToolchainStateFile } from "./types";

/**
 * One resolver for external runtimes. Consumers (ACP launch, MCP stdio) must
 * resolve node/uv/ripgrep only through this service. Explicit user choices
 * (custom path, explicit unconfigured) persist; derived sources are computed
 * on demand. See docs/features/managed-toolchains.
 */

export interface ToolchainServiceDeps {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Injectable version probe for tests. */
  probeVersion?: (binaryPath: string) => Promise<string | null>;
  now?: () => number;
}

const DEFAULT_ENV: NodeJS.ProcessEnv = process.env;
const MANAGED_TOOLS = ["node", "uv"] as const;
type ManagedTool = (typeof MANAGED_TOOLS)[number];

export class ToolchainService {
  private readonly dataDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly probeVersionImpl: (binaryPath: string) => Promise<string | null>;
  private readonly now: () => number;
  private state: ToolchainStateFile | null = null;
  private versionCache = new Map<string, string | null>();
  private syncCache = new Map<ToolchainName, ResolvedToolchain>();
  private installJobs = new Map<ManagedTool, InstallProgress>();
  private cancelFlags = new Map<ManagedTool, boolean>();
  constructor(deps: ToolchainServiceDeps) {
    this.dataDir = deps.dataDir;
    this.env = deps.env ?? DEFAULT_ENV;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.probeVersionImpl =
      deps.probeVersion ??
      (async (binaryPath) => {
        try {
          const proc = Bun.spawn([binaryPath, "--version"], { stdout: "pipe", stderr: "pipe" });
          const timer = setTimeout(() => proc.kill(), 5000);
          const exitCode = await proc.exited;
          clearTimeout(timer);
          if (exitCode !== 0) return null;
          const text = await new Response(proc.stdout).text();
          return text.trim().split(/\s+/).pop() || null;
        } catch {
          return null;
        }
      });
    this.now = deps.now ?? Date.now;
  }

  private async withState(): Promise<ToolchainStateFile> {
    if (!this.state) {
      this.state = await loadState(this.dataDir);
    }
    return this.state;
  }

  private async persist(state: ToolchainStateFile): Promise<void> {
    this.state = state;
    await saveState(this.dataDir, state);
  }

  private async probeVersion(binaryPath: string): Promise<string | null> {
    if (this.versionCache.has(binaryPath)) {
      return this.versionCache.get(binaryPath) ?? null;
    }
    const version = await this.probeVersionImpl(binaryPath);
    this.versionCache.set(binaryPath, version);
    return version;
  }

  private managedToolPath(tool: ManagedTool): string | null {
    const pin = pinFor(tool);
    const binary = tool === "node" ? "node" : "uv";
    const candidate = path.join(
      this.dataDir,
      "toolchains",
      "tools",
      tool,
      pin,
      process.platform === "win32" ? `${binary}.exe` : tool === "node" ? path.join("bin", binary) : binary,
    );
    return existsSync(candidate) ? candidate : null;
  }

  async resolve(tool: ToolchainName): Promise<ResolvedToolchain> {
    const state = await this.withState();
    const entry: ToolchainSourceEntry | undefined = state.sources[tool];

    let resolved: ResolvedToolchain;
    if (entry?.source === "custom") {
      const version = entry.path ? await this.probeVersion(entry.path).catch(() => null) : null;
      resolved = {
        source: "custom",
        explicit: true,
        path: entry.path ?? null,
        version: version ?? null,
        error: entry.path && !existsSync(entry.path) ? "Configured path does not exist" : null,
      };
    } else if (entry?.source === "unconfigured") {
      resolved = { source: "unconfigured", explicit: true, path: null, version: null, error: null };
    } else {
      resolved = await this.resolveDerived(tool);
    }

    this.syncCache.set(tool, resolved);
    return resolved;
  }

  private async resolveDerived(tool: ToolchainName): Promise<ResolvedToolchain> {
    return await resolveDerivedToolchain(tool, {
      dataDir: this.dataDir,
      env: this.env,
      managedPath: tool === "node" || tool === "uv" ? this.managedToolPath(tool) : null,
      probeVersion: (binaryPath) => this.probeVersion(binaryPath),
    });
  }

  /** Warm the synchronous cache (call at daemon startup). */
  async warmup(): Promise<void> {
    for (const tool of ["node", "uv", "ripgrep"] as ToolchainName[]) {
      await this.resolve(tool);
    }
  }

  private cached(tool: ToolchainName): ResolvedToolchain {
    return (
      this.syncCache.get(tool) ?? { source: "unconfigured", explicit: false, path: null, version: null, error: null }
    );
  }

  async status(tool: ToolchainName): Promise<ToolchainStatus> {
    const install = this.installJobs.get(tool as ManagedTool) ?? null;
    const installError = this.installErrors.get(tool as ManagedTool) ?? null;
    const resolved = await this.resolve(tool);
    return {
      tool,
      source: resolved.source,
      explicit: resolved.explicit,
      path: resolved.path,
      version: resolved.version,
      error: installError ?? resolved.error,
      pin: tool === "node" ? NODE_PIN : tool === "uv" ? UV_PIN : null,
      install,
    };
  }

  async list(): Promise<ToolchainStatus[]> {
    return Promise.all((["node", "uv", "ripgrep"] as ToolchainName[]).map((tool) => this.status(tool)));
  }

  async setSource(
    tool: ToolchainName,
    source: "custom" | "unconfigured",
    customPath?: string,
  ): Promise<ToolchainStatus> {
    const state = await this.withState();
    if (source === "custom") {
      if (!customPath || !existsSync(customPath)) {
        throw new Error(`Custom toolchain path does not exist: ${customPath}`);
      }
      state.sources[tool] = { source: "custom", explicit: true, path: customPath };
    } else {
      state.sources[tool] = { source: "unconfigured", explicit: true };
    }
    this.versionCache.clear();
    await this.persist(state);
    return this.status(tool);
  }

  async removeSource(tool: ToolchainName): Promise<ToolchainStatus> {
    const state = await this.withState();
    delete state.sources[tool];
    // Reverting a managed install removes its tree so bundled/system can
    // serve again; without this the derived managed source would simply
    // re-resolve and the UI revert would do nothing.
    const tree = path.join(this.dataDir, "toolchains", "tools", tool);
    try {
      fs.rmSync(tree, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[toolchains] failed to remove managed tree for ${tool}:`, error);
    }
    this.versionCache.clear();
    await this.persist(state);
    return this.status(tool);
  }

  install(tool: "node" | "uv"): { started: boolean } {
    if (this.installJobs.has(tool)) {
      return { started: false };
    }
    const progress: InstallProgress = { phase: "downloading", tool, version: pinFor(tool), startedAt: this.now() };
    this.installJobs.set(tool, progress);
    this.cancelFlags.set(tool, false);
    void this.runInstall(tool);
    return { started: true };
  }

  private async runInstall(tool: ManagedTool): Promise<void> {
    const advance = (phase: InstallProgress["phase"]) => {
      const job = this.installJobs.get(tool);
      if (job) {
        this.installJobs.set(tool, { ...job, phase });
      }
    };
    let succeeded = false;
    try {
      await installToolchain(tool, {
        dataDir: this.dataDir,
        fetchImpl: this.fetchImpl,
        cancelled: () => this.cancelFlags.get(tool) === true,
        onPhase: (phase) => advance(phase),
        extract: async (archivePath, destinationDir) => {
          const proc = Bun.spawn(["tar", "-xf", archivePath, "-C", destinationDir], {
            stdout: "pipe",
            stderr: "pipe",
          });
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new ToolchainInstallError(
              `Archive extraction failed (tar exit ${exitCode}): ${stderr.slice(0, 400)}`,
            );
          }
        },
      });
      succeeded = true;
    } catch (error) {
      const job = this.installJobs.get(tool);
      if (job) {
        const message = error instanceof Error ? error.message : String(error);
        this.installJobs.set(tool, { ...job, phase: "idle" });
        // Surface the failure on the next status poll via a synthetic error map.
        this.installErrors.set(tool, message);
      }
    }
    if (succeeded) {
      // Activation changed the tree: refresh the version probe and the warm
      // sync cache so consumers immediately see the managed tool.
      this.versionCache.clear();
      await this.resolve(tool).catch(() => undefined);
    }
    // The job record stays until the next `status()`/`install()` observes the
    // terminal state; keep it for one poll so the UI sees completion.
    setTimeout(() => {
      this.installJobs.delete(tool);
      this.installErrors.delete(tool);
      this.cancelFlags.delete(tool);
    }, 2500);
  }

  private installErrors = new Map<ManagedTool, string>();

  cancelInstall(tool: "node" | "uv"): void {
    this.cancelFlags.set(tool, true);
  }

  /**
   * Rewrite a spawn command through the resolved toolchains. Unresolvable
   * commands return unchanged so PATH lookup (and its error) still applies.
   */
  async resolveCommand(command: string, args: string[]): Promise<{ command: string; args: string[] }> {
    if (command === "node" || command === "npm" || command === "npx") {
      const node = await this.resolve("node");
      if (!node.path) {
        return { command, args };
      }
      if (command === "node") {
        return { command: node.path, args };
      }
      const cliRelative = process.platform === "win32" ? "node_modules/npm/bin" : "../lib/node_modules/npm/bin";
      const cli = path.join(binDirFor(node.path), cliRelative, command === "npx" ? "npx-cli.js" : "npm-cli.js");
      if (!existsSync(cli)) {
        return { command, args };
      }
      return { command: node.path, args: [cli, ...args] };
    }
    if (command === "uv" || command === "uvx") {
      const uv = await this.resolve("uv");
      if (!uv.path) {
        return { command, args };
      }
      if (command === "uv") {
        return { command: uv.path, args };
      }
      const uvxName = process.platform === "win32" ? "uvx.exe" : "uvx";
      const uvx = path.join(binDirFor(uv.path), uvxName);
      if (existsSync(uvx)) {
        return { command: uvx, args };
      }
      // `uvx pkg` is equivalent to `uv tool run pkg`; never pass uvx's
      // arguments to bare `uv`.
      return { command: uv.path, args: ["tool", "run", ...args] };
    }
    return { command, args };
  }

  /**
   * Synchronous variant backed by the warm cache. Serves sync host seams
   * (MCP `processCommandWithArgs`); callers should have run `warmup()` once
   * at startup — cache misses resolve to the input unchanged.
   */
  resolveCommandSync(command: string, args: string[]): { command: string; args: string[] } {
    if (command === "node" || command === "npm" || command === "npx") {
      const node = this.cached("node");
      if (!node.path) {
        return { command, args };
      }
      if (command === "node") {
        return { command: node.path, args };
      }
      const cliRelative = process.platform === "win32" ? "node_modules/npm/bin" : "../lib/node_modules/npm/bin";
      const cli = path.join(binDirFor(node.path), cliRelative, command === "npx" ? "npx-cli.js" : "npm-cli.js");
      if (!existsSync(cli)) {
        return { command, args };
      }
      return { command: node.path, args: [cli, ...args] };
    }
    if (command === "uv" || command === "uvx") {
      const uv = this.cached("uv");
      if (!uv.path) {
        return { command, args };
      }
      if (command === "uv") {
        return { command: uv.path, args };
      }
      const uvxName = process.platform === "win32" ? "uvx.exe" : "uvx";
      const uvx = path.join(binDirFor(uv.path), uvxName);
      if (existsSync(uvx)) {
        return { command: uvx, args };
      }
      // `uvx pkg` is equivalent to `uv tool run pkg`; never pass uvx's
      // arguments to bare `uv`.
      return { command: uv.path, args: ["tool", "run", ...args] };
    }
    return { command, args };
  }

  /** Bin dirs that should be prepended to PATH for spawned consumers. */
  async binDirs(): Promise<string[]> {
    const dirs: string[] = [];
    for (const tool of ["node", "uv", "ripgrep"] as ToolchainName[]) {
      const resolved = await this.resolve(tool);
      if (resolved.path) {
        dirs.push(binDirFor(resolved.path));
      }
    }
    return [...new Set(dirs)];
  }

  /** Synchronous `binDirs` backed by the warm cache. */
  binDirsSync(): string[] {
    const dirs: string[] = [];
    for (const tool of ["node", "uv", "ripgrep"] as ToolchainName[]) {
      const resolved = this.cached(tool);
      if (resolved.path) {
        dirs.push(binDirFor(resolved.path));
      }
    }
    return [...new Set(dirs)];
  }

  /** Synchronous bin dir of one tool, or null when unresolved. */
  binDirForToolSync(tool: ToolchainName): string | null {
    const resolved = this.cached(tool);
    return resolved.path ? binDirFor(resolved.path) : null;
  }
}

export type { ToolchainSource };
