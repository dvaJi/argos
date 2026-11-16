import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { UsageLimitProvider, UsageLimitWindow } from "@argos/shared-contracts/routes";
import { listJsonlFiles } from "./localUsageScanner";

/**
 * Reads subscription quota snapshots from local agent logs.
 *
 * Codex writes `rate_limits` on every `event_msg.token_count` entry:
 * `primary` is the 5h session window, `secondary` the 7d weekly window,
 * `resets_at` is epoch seconds. The newest entry across recent session files
 * is the current snapshot. Claude Code does not persist quota data locally.
 */

const SESSION_MINUTES = 5 * 60;
const WEEK_MINUTES = 7 * 24 * 60;
/** Only the newest few rollouts can hold the latest snapshot. */
const MAX_CODEX_FILES = 8;

const PLAN_LABELS: Record<string, string> = {
  free: "ChatGPT Free",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
};

function windowLabel(minutes: number | null, fallback: string): string {
  if (minutes === SESSION_MINUTES) return "Session";
  if (minutes === WEEK_MINUTES) return "Weekly";
  if (minutes === null) return fallback;
  return minutes % 1440 === 0 ? `${minutes / 1440}d window` : `${Math.round(minutes / 60)}h window`;
}

function toWindow(id: string, fallbackLabel: string, raw: unknown, now: number): UsageLimitWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const used = Number(value["used_percent"]);
  if (!Number.isFinite(used)) return null;
  const minutes = Number(value["window_minutes"]);
  const windowMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  const resetsSeconds = Number(value["resets_at"]);
  let resetsAt = Number.isFinite(resetsSeconds) && resetsSeconds > 0 ? resetsSeconds * 1000 : null;
  let usedPercent = Math.max(0, Math.min(100, used));
  // The log only updates when Codex runs a turn; a window whose reset already
  // passed has rolled over, so it is fully available again.
  if (resetsAt !== null && resetsAt <= now) {
    usedPercent = 0;
    resetsAt = windowMinutes !== null ? null : resetsAt;
  }
  return { id, label: windowLabel(windowMinutes, fallbackLabel), usedPercent, windowMinutes, resetsAt };
}

interface CodexSnapshot {
  observedAt: number;
  rateLimits: Record<string, unknown>;
}

/** Rollouts can hold tens of thousands of lines; the newest snapshot is near the end. */
const TAIL_BYTES = 256 * 1024;
const LIMITS_CACHE_TTL_MS = 10_000;
let limitsCache: { key: string; expiresAt: number; providers: UsageLimitProvider[] } | null = null;

function readText(filePath: string, tailOnly: boolean): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    const start = tailOnly ? Math.max(0, size - TAIL_BYTES) : 0;
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function lastRateLimits(text: string): CodexSnapshot | null {
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!line.includes('"rate_limits"')) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const payload = entry["payload"] as Record<string, unknown> | undefined;
      const rateLimits = payload?.["rate_limits"];
      if (!rateLimits || typeof rateLimits !== "object") continue;
      const timestamp = Date.parse(String(entry["timestamp"] ?? ""));
      return {
        observedAt: Number.isFinite(timestamp) ? timestamp : 0,
        rateLimits: rateLimits as Record<string, unknown>,
      };
    } catch {
      // partial line (tail cut) or corrupt entry; keep scanning backwards
    }
  }
  return null;
}

/** Latest `rate_limits` entry in a Codex rollout: tail first, whole file as fallback. */
export function readCodexRateLimits(filePath: string): CodexSnapshot | null {
  const tail = readText(filePath, true);
  const fromTail = tail === null ? null : lastRateLimits(tail);
  if (fromTail) return fromTail;
  const full = readText(filePath, false);
  return full === null || full.length === (tail?.length ?? -1) ? null : lastRateLimits(full);
}

export function scanCodexLimits(home: string, now: number): UsageLimitProvider | null {
  const files = listJsonlFiles(path.join(home, ".codex", "sessions"))
    .map((filePath) => {
      try {
        return { filePath, mtime: fs.statSync(filePath).mtimeMs };
      } catch {
        return { filePath, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_CODEX_FILES);

  let latest: CodexSnapshot | null = null;
  for (const { filePath } of files) {
    const snapshot = readCodexRateLimits(filePath);
    if (snapshot && (latest === null || snapshot.observedAt > latest.observedAt)) latest = snapshot;
  }
  if (!latest) return null;

  const windows = [
    toWindow("primary", "Primary", latest.rateLimits["primary"], now),
    toWindow("secondary", "Secondary", latest.rateLimits["secondary"], now),
  ].filter((window): window is UsageLimitWindow => window !== null);
  if (windows.length === 0) return null;

  const planType = typeof latest.rateLimits["plan_type"] === "string" ? latest.rateLimits["plan_type"] : null;
  return {
    id: "codex",
    label: "Codex",
    plan: planType ? (PLAN_LABELS[planType] ?? planType) : null,
    observedAt: latest.observedAt || null,
    windows,
  };
}

export function scanLocalUsageLimits(options: { home?: string; now?: number } = {}): UsageLimitProvider[] {
  const home = options.home ?? process.env.ARGOS_USAGE_HOME ?? os.homedir();
  const now = options.now ?? Date.now();
  if (limitsCache && limitsCache.key === home && limitsCache.expiresAt > now && options.now === undefined) {
    return limitsCache.providers;
  }
  const providers = [scanCodexLimits(home, now)].filter(
    (provider): provider is UsageLimitProvider => provider !== null,
  );
  limitsCache = { key: home, expiresAt: now + LIMITS_CACHE_TTL_MS, providers };
  return providers;
}
