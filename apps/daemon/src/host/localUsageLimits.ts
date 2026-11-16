import os from "node:os";
import path from "node:path";
import type { UsageLimitProvider, UsageLimitWindow } from "@argos/shared-contracts/routes";
import { listJsonlFiles } from "./localUsageScanner";
import { readClaudeLimits } from "./claudeUsageLimits";

/**
 * Reads subscription quota snapshots from local agent logs.
 *
 * Codex writes `rate_limits` on every `event_msg.token_count` entry:
 * `primary` is the 5h session window, `secondary` the 7d weekly window,
 * `resets_at` is epoch seconds. The newest entry across recent session files
 * is the current snapshot. Claude Code limits come from its OAuth usage
 * endpoint (see claudeUsageLimits.ts).
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

/** Rollouts can hold tens of thousands of lines; scan backwards in bounded chunks. */
const CHUNK_BYTES = 256 * 1024;
const LIMITS_CACHE_TTL_MS = 10_000;
let limitsCache: { key: string; expiresAt: number; providers: UsageLimitProvider[] } | null = null;

function parseRateLimitsLine(line: string): CodexSnapshot | null {
  if (!line.includes('"rate_limits"')) return null;
  try {
    const entry = JSON.parse(line) as Record<string, unknown>;
    const payload = entry["payload"] as Record<string, unknown> | undefined;
    const rateLimits = payload?.["rate_limits"];
    if (!rateLimits || typeof rateLimits !== "object") return null;
    const timestamp = Date.parse(String(entry["timestamp"] ?? ""));
    return {
      observedAt: Number.isFinite(timestamp) ? timestamp : 0,
      rateLimits: rateLimits as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Latest `rate_limits` entry in a Codex rollout. Reads backwards one chunk at
 * a time, carrying the partial first line into the next (earlier) chunk, so
 * memory stays bounded regardless of file size.
 */
export async function readCodexRateLimits(filePath: string): Promise<CodexSnapshot | null> {
  try {
    const file = Bun.file(filePath);
    let end = file.size;
    let carry = "";
    while (end > 0) {
      const start = Math.max(0, end - CHUNK_BYTES);
      const text = (await file.slice(start, end).text()) + carry;
      const lines = text.split("\n");
      // The first line may be cut mid-way unless we reached the file start.
      carry = start > 0 ? (lines.shift() ?? "") : "";
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const snapshot = parseRateLimitsLine(lines[index]!);
        if (snapshot) return snapshot;
      }
      end = start;
    }
    return carry ? parseRateLimitsLine(carry) : null;
  } catch {
    return null;
  }
}

export async function scanCodexLimits(home: string, now: number): Promise<UsageLimitProvider | null> {
  const files = listJsonlFiles(path.join(home, ".codex", "sessions"))
    .map((filePath) => ({ filePath, mtime: Bun.file(filePath).lastModified }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_CODEX_FILES);

  let latest: CodexSnapshot | null = null;
  for (const { filePath } of files) {
    const snapshot = await readCodexRateLimits(filePath);
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

export async function scanLocalUsageLimits(
  options: { home?: string; now?: number } = {},
): Promise<UsageLimitProvider[]> {
  const home = options.home ?? process.env.ARGOS_USAGE_HOME ?? os.homedir();
  const now = options.now ?? Date.now();
  if (limitsCache && limitsCache.key === home && limitsCache.expiresAt > now && options.now === undefined) {
    return limitsCache.providers;
  }
  const codex = await scanCodexLimits(home, now);
  const providers = codex ? [codex] : [];
  limitsCache = { key: home, expiresAt: now + LIMITS_CACHE_TTL_MS, providers };
  return providers;
}

/** All providers with quota windows: Codex from local logs, Claude Code from its usage endpoint. */
export async function readUsageLimits(options: { home?: string; now?: number } = {}): Promise<UsageLimitProvider[]> {
  const home = options.home ?? process.env.ARGOS_USAGE_HOME ?? os.homedir();
  const now = options.now ?? Date.now();
  const claude = await readClaudeLimits({ home, now }).catch(() => null);
  const codex = await scanLocalUsageLimits({ home, now: options.now });
  return [...codex, ...(claude ? [claude] : [])];
}
