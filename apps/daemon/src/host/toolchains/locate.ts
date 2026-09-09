import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ResolvedToolchain, ToolchainName, ToolchainSource } from "./types";

/**
 * Source resolution precedence:
 *   explicit custom -> explicit unconfigured -> managed -> bundled -> system -> unconfigured.
 * `managed`/`bundled`/`system` are derived on demand and never persisted.
 */

const EXE = (name: string): string => (process.platform === "win32" ? `${name}.exe` : name);

const TOOL_BINARIES: Record<ToolchainName, string[]> = {
  node: ["node"],
  uv: ["uv"],
  ripgrep: ["rg"],
};

/** Candidate roots for the app-shipped runtime seed. */
export function bundledRoots(dataDir: string): string[] {
  const execDir = path.dirname(process.execPath);
  const cwd = process.cwd();
  const roots = [path.join(execDir, "..", "runtime"), path.join(execDir, "runtime"), path.join(cwd, "runtime")];
  // The desktop sidecar also seeds the daemon data dir in dev.
  if (dataDir && dataDir !== cwd) {
    roots.push(path.join(dataDir, "runtime"));
  }
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function findFileIn(dirs: string[], relative: string[]): string | null {
  for (const dir of dirs) {
    const candidate = path.join(dir, ...relative);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Locate the bundled seed binary for a tool, or null. */
export function bundledToolPath(tool: ToolchainName, dataDir: string): string | null {
  if (tool === "node") {
    // Argos never bundles Node (the daemon itself is a Bun binary).
    return null;
  }
  const dirByTool: Record<Exclude<ToolchainName, "node">, string> = {
    uv: "uv",
    ripgrep: "ripgrep",
  };
  const root = findFileIn(
    bundledRoots(dataDir),
    dirByTool[tool as Exclude<ToolchainName, "node">] ? [dirByTool[tool as Exclude<ToolchainName, "node">]] : [],
  );
  if (!root) {
    return null;
  }
  return findFileIn(
    [root],
    TOOL_BINARIES[tool].map((name) => EXE(name)),
  );
}

/** Default well-known install dirs merged with PATH dirs for system detection. */
export function systemSearchDirs(env: NodeJS.ProcessEnv): string[] {
  const home = env.USERPROFILE ?? env.HOME ?? "";
  const programFiles = env.ProgramFiles ?? (process.platform === "win32" ? "C:\\Program Files" : "");
  const localAppData = env.LOCALAPPDATA ?? "";
  const dirs: string[] = [];
  for (const entry of (env.PATH ?? "").split(path.delimiter)) {
    if (entry.trim()) {
      dirs.push(entry.trim());
    }
  }
  if (process.platform === "win32") {
    if (home) {
      dirs.push(
        path.join(home, "AppData", "Roaming", "nvm"),
        path.join(home, "scoop", "shims"),
        path.join(home, ".cargo", "bin"),
      );
    }
    if (programFiles) {
      dirs.push(path.join(programFiles, "nodejs"));
    }
    if (localAppData) {
      dirs.push(path.join(localAppData, "Programs", "uv"));
    }
  } else {
    dirs.push(
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin",
      path.join(home, ".local", "bin"),
      path.join(home, ".cargo", "bin"),
    );
    if (home) {
      dirs.push(path.join(home, ".nvm", "versions"), path.join(home, ".volta", "bin"), path.join(home, ".bun", "bin"));
    }
  }
  return [...new Set(dirs)];
}

/** Locate a system-installed binary for a tool, or null. */
export function systemToolPath(tool: ToolchainName, env: NodeJS.ProcessEnv): string | null {
  const binaries = TOOL_BINARIES[tool].map((name) => EXE(name));
  for (const dir of expandVersionManagerDirs(systemSearchDirs(env))) {
    for (const binary of binaries) {
      const candidate = path.join(dir, binary);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/** Version-manager roots hide a bin dir per installed version; expand them. */
function expandVersionManagerDirs(dirs: string[]): string[] {
  const expanded: string[] = [];
  for (const dir of dirs) {
    expanded.push(dir);
    const normalized = dir.replace(/\\/g, "/");
    if (!normalized.includes("/.nvm")) continue;
    // nvm layout: <root>/node/<version>/bin (POSIX), <root>\<version> (Windows)
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const versionDir = path.join(dir, entry);
      if (!isDirectory(versionDir)) continue;
      expanded.push(process.platform === "win32" ? versionDir : path.join(versionDir, "bin"));
    }
  }
  return expanded;
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export interface DerivedResolveOptions {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  /** Resolved path of the managed tree, when present. */
  managedPath?: string | null;
  /** Version probe override (tests). */
  probeVersion?: (binaryPath: string) => Promise<string | null>;
}

/**
 * Derive a non-explicit source: managed -> bundled -> system -> unconfigured.
 * Standalone so hosts and tests can run it against an isolated dataDir/env.
 */
export async function resolveDerivedToolchain(
  tool: ToolchainName,
  opts: DerivedResolveOptions,
): Promise<ResolvedToolchain> {
  const probe = opts.probeVersion ?? (async () => null);

  if (tool === "node" || tool === "uv") {
    if (opts.managedPath && existsSync(opts.managedPath)) {
      return {
        source: "managed",
        explicit: false,
        path: opts.managedPath,
        version: await probe(opts.managedPath),
        error: null,
      };
    }
  }

  const bundled = bundledToolPath(tool, opts.dataDir);
  if (bundled) {
    return { source: "bundled", explicit: false, path: bundled, version: await probe(bundled), error: null };
  }

  const system = systemToolPath(tool, opts.env);
  if (system) {
    return { source: "system", explicit: false, path: system, version: await probe(system), error: null };
  }

  return { source: "unconfigured", explicit: false, path: null, version: null, error: null };
}

/** Directory that must go on PATH for a resolved binary to be usable. */
export function binDirFor(binaryPath: string): string {
  return path.dirname(binaryPath);
}
