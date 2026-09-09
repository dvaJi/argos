import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolchainName, ToolchainStateFile } from "./types";

/**
 * Persists only explicit user choices (custom path / explicit unconfigured).
 * Derived sources (managed/bundled/system) are recomputed on demand so a PATH
 * refresh or a removed bundled seed cannot leave a stale pointer behind.
 * Corrupt state is quarantined under a timestamped name — a fixed
 * `state.json.corrupt` would throw EEXIST on the second corruption.
 */

const STATE_VERSION = 1 as const;

export function toolchainsDir(dataDir: string): string {
  return join(dataDir, "toolchains");
}

function stateFilePath(dataDir: string): string {
  return join(toolchainsDir(dataDir), "state.json");
}

export function emptyState(): ToolchainStateFile {
  return { version: STATE_VERSION, sources: {} };
}

export async function loadState(dataDir: string): Promise<ToolchainStateFile> {
  const filePath = stateFilePath(dataDir);
  if (!existsSync(filePath)) {
    return emptyState();
  }
  try {
    const raw = await Bun.file(filePath).text();
    const parsed = JSON.parse(raw) as Partial<ToolchainStateFile> | null;
    if (!parsed || typeof parsed !== "object" || parsed.version !== STATE_VERSION) {
      throw new Error("unsupported state version");
    }
    const sources = parsed.sources ?? {};
    const clean: ToolchainStateFile["sources"] = {};
    for (const [tool, entry] of Object.entries(sources)) {
      if (!entry || (entry.source !== "custom" && entry.source !== "unconfigured")) {
        continue;
      }
      if (entry.source === "custom" && typeof entry.path !== "string") {
        continue;
      }
      clean[tool as ToolchainName] = { source: entry.source, explicit: true, path: entry.path };
    }
    return { version: STATE_VERSION, sources: clean };
  } catch {
    // Quarantine under a timestamped name so repeated corruption cannot make
    // every subsequent load throw (EEXIST on a fixed quarantine name).
    try {
      await Bun.write(
        join(toolchainsDir(dataDir), `state.corrupt-${Date.now()}.json`),
        await Bun.file(filePath).arrayBuffer(),
      );
      // Persist a VALID empty state — an empty string would re-corrupt on
      // every load and grow a quarantine copy per daemon start.
      await Bun.write(filePath, JSON.stringify(emptyState(), null, 2));
    } catch {
      // best-effort quarantine; a fresh state is returned regardless
    }
    return emptyState();
  }
}

export async function saveState(dataDir: string, state: ToolchainStateFile): Promise<void> {
  const dir = toolchainsDir(dataDir);
  await Bun.write(join(dir, ".keep"), "");
  await Bun.write(stateFilePath(dataDir), JSON.stringify(state, null, 2));
}
