import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/**
 * RuntimeHelper - Utility class for managing runtime paths and environment variables
 * Uses singleton pattern to cache runtime paths and avoid repeated filesystem checks
 */
export class RuntimeHelper {
  private static instance: RuntimeHelper | null = null;
  private bunRuntimePath: string | null = null;
  private uvRuntimePath: string | null = null;
  private ripgrepRuntimePath: string | null = null;
  private runtimesInitialized: boolean = false;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of RuntimeHelper
   */
  public static getInstance(): RuntimeHelper {
    if (!RuntimeHelper.instance) {
      RuntimeHelper.instance = new RuntimeHelper();
    }
    return RuntimeHelper.instance;
  }

  /**
   * Initialize runtime paths (idempotent operation)
   * Caches Node.js, UV and Ripgrep runtime paths to avoid repeated filesystem checks
   */
  public initializeRuntimes(force: boolean = false): void {
    if (this.runtimesInitialized && !force) {
      return;
    }

    if (force) {
      this.bunRuntimePath = null;
      this.uvRuntimePath = null;
      this.ripgrepRuntimePath = null;
    }

    const runtimeBasePath = path.join(app.getAppPath(), "runtime").replace("app.asar", "app.asar.unpacked");

    // Resolve Bun binary: prefer bundled runtime/bun, then PATH, then null
    const bundledBunDir = path.join(runtimeBasePath, "bun");
    if (process.platform === "win32") {
      const bunExe = path.join(bundledBunDir, "bun.exe");
      if (fs.existsSync(bunExe)) {
        this.bunRuntimePath = bunExe;
      } else {
        this.bunRuntimePath = this.findInPath("bun.exe");
      }
    } else {
      const bunBin = path.join(bundledBunDir, "bun");
      if (fs.existsSync(bunBin)) {
        this.bunRuntimePath = bunBin;
      } else {
        this.bunRuntimePath = this.findInPath("bun");
      }
    }

    // Check if uv runtime file exists
    const uvRuntimePath = path.join(runtimeBasePath, "uv");
    if (process.platform === "win32") {
      const uvExe = path.join(uvRuntimePath, "uv.exe");
      const uvxExe = path.join(uvRuntimePath, "uvx.exe");
      if (fs.existsSync(uvExe) && fs.existsSync(uvxExe)) {
        this.uvRuntimePath = uvRuntimePath;
      } else {
        this.uvRuntimePath = null;
      }
    } else {
      const uvBin = path.join(uvRuntimePath, "uv");
      const uvxBin = path.join(uvRuntimePath, "uvx");
      if (fs.existsSync(uvBin) && fs.existsSync(uvxBin)) {
        this.uvRuntimePath = uvRuntimePath;
      } else {
        this.uvRuntimePath = null;
      }
    }

    // Check if ripgrep runtime file exists
    const ripgrepRuntimePath = path.join(runtimeBasePath, "ripgrep");
    if (process.platform === "win32") {
      const rgExe = path.join(ripgrepRuntimePath, "rg.exe");
      if (fs.existsSync(rgExe)) {
        this.ripgrepRuntimePath = ripgrepRuntimePath;
      } else {
        this.ripgrepRuntimePath = null;
      }
    } else {
      const rgBin = path.join(ripgrepRuntimePath, "rg");
      if (fs.existsSync(rgBin)) {
        this.ripgrepRuntimePath = ripgrepRuntimePath;
      } else {
        this.ripgrepRuntimePath = null;
      }
    }

    this.runtimesInitialized = true;
  }

  public refreshRuntimes(): void {
    this.initializeRuntimes(true);
  }

  /**
   * Get Bun runtime path
   * @returns Bun binary path or null if not found
   */
  public getBunRuntimePath(): string | null {
    return this.bunRuntimePath;
  }

  public setBunRuntimePath(value: string | null): void {
    this.bunRuntimePath = value;
  }

  /**
   * Find a command in PATH
   */
  private findInPath(command: string): string | null {
    const separator = process.platform === "win32" ? ";" : ":";
    const pathEnv = process.env.PATH || process.env.Path || "";
    const candidates = pathEnv.split(separator).filter(Boolean);
    for (const dir of candidates) {
      const full = path.join(dir, command);
      try {
        if (fs.existsSync(full)) return full;
      } catch {
        // ignore
      }
    }
    return null;
  }

  /**
   * Get UV runtime path
   * @returns UV runtime path or null if not found
   */
  public getUvRuntimePath(): string | null {
    return this.uvRuntimePath;
  }

  public setUvRuntimePath(value: string | null): void {
    this.uvRuntimePath = value;
  }

  /**
   * Get Ripgrep runtime path
   * @returns Ripgrep runtime path or null if not found
   */
  public getRipgrepRuntimePath(): string | null {
    return this.ripgrepRuntimePath;
  }

  public getBundledRuntimeBinPaths(): string[] {
    this.initializeRuntimes();

    const candidates: string[] = [];

    if (this.bunRuntimePath) {
      candidates.push(path.dirname(this.bunRuntimePath));
    }
    if (this.uvRuntimePath) {
      candidates.push(this.uvRuntimePath);
    }
    if (this.ripgrepRuntimePath) {
      candidates.push(this.ripgrepRuntimePath);
    }

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (!candidate || !fs.existsSync(candidate)) {
        return false;
      }
      const normalized = process.platform === "win32" ? candidate.toLowerCase() : candidate;
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  public prependBundledRuntimeToEnv(env: Record<string, string>): Record<string, string> {
    const runtimePaths = this.getBundledRuntimeBinPaths();
    if (runtimePaths.length === 0) {
      return { ...env };
    }

    const separator = process.platform === "win32" ? ";" : ":";
    const nextEnv = { ...env };
    const existingPath =
      nextEnv.PATH ||
      nextEnv.Path ||
      process.env.PATH ||
      process.env.Path ||
      this.getDefaultPaths(app.getPath("home")).join(separator);

    const entries = existingPath.split(separator).filter(Boolean);
    const seen = new Set<string>();
    const merged = [...runtimePaths, ...entries].filter((entry) => {
      const normalized = process.platform === "win32" ? entry.toLowerCase() : entry;
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    const value = merged.join(separator);
    nextEnv.PATH = value;
    if (process.platform === "win32") {
      nextEnv.Path = value;
    }

    return nextEnv;
  }

  /**
   * Replace command with runtime version if needed
   * @param command Original command
   * @param useBuiltinRuntime Whether to use builtin runtime
   * @param checkExists Whether to check if file exists (default: true)
   * @returns Processed command path or original command
   */
  public replaceWithRuntimeCommand(command: string, useBuiltinRuntime: boolean, checkExists: boolean = true): string {
    // If useBuiltinRuntime is false, return original command
    if (!useBuiltinRuntime) {
      return command;
    }

    // Get command basename (remove path)
    const basename = path.basename(command);

    // Handle Node.js related commands -> map to Bun
    if (["node", "npm", "npx"].includes(basename)) {
      const bunPath = this.bunRuntimePath;
      if (bunPath) {
        if (!checkExists || fs.existsSync(bunPath)) {
          return bunPath;
        }
      }
      return command;
    }

    // UV command handling (all platforms)
    if (["uv", "uvx"].includes(basename)) {
      if (!this.uvRuntimePath) {
        return command;
      }

      // Both uv and uvx use their corresponding commands
      const targetCommand = basename === "uvx" ? "uvx" : "uv";

      if (process.platform === "win32") {
        const uvPath = path.join(this.uvRuntimePath, `${targetCommand}.exe`);
        if (checkExists) {
          if (fs.existsSync(uvPath)) {
            return uvPath;
          }
          // If doesn't exist, return original command to let system find it via PATH
          return command;
        } else {
          return uvPath;
        }
      } else {
        const uvPath = path.join(this.uvRuntimePath, targetCommand);
        if (checkExists) {
          if (fs.existsSync(uvPath)) {
            return uvPath;
          }
          // If doesn't exist, return original command to let system find it via PATH
          return command;
        } else {
          return uvPath;
        }
      }
    }

    // Ripgrep command handling (all platforms)
    if (basename === "rg") {
      if (!this.ripgrepRuntimePath) {
        return command;
      }

      if (process.platform === "win32") {
        const rgPath = path.join(this.ripgrepRuntimePath, "rg.exe");
        if (checkExists) {
          if (fs.existsSync(rgPath)) {
            return rgPath;
          }
          return command;
        } else {
          return rgPath;
        }
      } else {
        const rgPath = path.join(this.ripgrepRuntimePath, "rg");
        if (checkExists) {
          if (fs.existsSync(rgPath)) {
            return rgPath;
          }
          return command;
        } else {
          return rgPath;
        }
      }
    }

    return command;
  }

  /**
   * Process command and arguments with runtime replacement (for mcpClient)
   * This method does not check file existence and always tries to replace
   * @param command Original command
   * @param args Command arguments
   * @returns Processed command and arguments
   */
  public processCommandWithArgs(command: string, args: string[]): { command: string; args: string[] } {
    const resolvedCommand = this.replaceWithRuntimeCommand(command, true, false);
    const basename = path.basename(command);
    if (basename === "npx" && resolvedCommand !== command) {
      return {
        command: resolvedCommand,
        args: ["x", ...args],
      };
    }
    return {
      command: resolvedCommand,
      args: args.map((arg) => this.replaceWithRuntimeCommand(arg, true, false)),
    };
  }

  /**
   * Expand various symbols and variables in paths
   * @param inputPath Input path that may contain ~ or environment variables
   * @returns Expanded path
   */
  public expandPath(inputPath: string): string {
    let expandedPath = inputPath;

    // Handle ~ symbol (user home directory)
    if (expandedPath.startsWith("~/") || expandedPath === "~") {
      const homeDir = app.getPath("home");
      expandedPath = expandedPath.replace("~", homeDir);
    }

    // Handle environment variable expansion
    expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });

    // Handle simple $VAR format (without braces)
    expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
      return process.env[varName] || match;
    });

    return expandedPath;
  }

  /**
   * Normalize PATH environment variable
   * @param paths Array of paths to merge
   * @returns Normalized PATH key-value pair
   */
  public normalizePathEnv(paths: string[]): { key: string; value: string } {
    const isWindows = process.platform === "win32";
    const separator = isWindows ? ";" : ":";
    const pathKey = isWindows ? "Path" : "PATH";
    const pathValue = paths.filter(Boolean).join(separator);
    return { key: pathKey, value: pathValue };
  }

  /**
   * Get system-specific default paths
   * @param homeDir User home directory
   * @returns Array of default system paths
   */
  public getDefaultPaths(homeDir: string): string[] {
    if (process.platform === "darwin") {
      return [
        "/bin",
        "/usr/bin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/opt/node/bin",
        "/opt/local/bin",
        `${homeDir}/.cargo/bin`,
      ];
    } else if (process.platform === "linux") {
      return ["/bin", "/usr/bin", "/usr/local/bin", `${homeDir}/.cargo/bin`];
    } else {
      // Windows
      return [`${homeDir}\\.cargo\\bin`, `${homeDir}\\.local\\bin`];
    }
  }

  /**
   * Check if the application is installed in a Windows system directory
   * System directories include Program Files and Program Files (x86)
   * @returns true if installed in system directory, false otherwise
   */
  public isInstalledInSystemDirectory(): boolean {
    if (process.platform !== "win32") {
      return false;
    }

    const appPath = app.getAppPath();
    const normalizedPath = appPath.toLowerCase();

    // Check if app is installed in Program Files or Program Files (x86)
    const isSystemDir = normalizedPath.includes("program files") || normalizedPath.includes("program files (x86)");

    if (isSystemDir) {
      console.log("[RuntimeHelper] Application is installed in system directory:", appPath);
    }

    return isSystemDir;
  }

  /**
   * Get user npm prefix path for Windows
   * Returns the path where npm should install global packages when app is in system directory
   * @returns User npm prefix path or null if not applicable
   */
  public getUserNpmPrefix(): string | null {
    if (process.platform !== "win32") {
      return null;
    }

    const appDataPath = app.getPath("appData");
    return path.join(appDataPath, "npm");
  }
}
