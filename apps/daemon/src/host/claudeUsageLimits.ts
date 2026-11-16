import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { UsageLimitProvider, UsageLimitWindow } from "@argos/shared-contracts/routes";

/**
 * Claude Code does not persist quota data locally, so its limits come from
 * Anthropic's OAuth usage endpoint, authenticated with the token Claude Code
 * already stored for the signed-in user. The token is only read, never
 * refreshed: refreshing would rotate it and sign the Claude Code CLI out.
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const REQUEST_TIMEOUT_MS = 8_000;
/** The endpoint rate-limits aggressively; one fetch per minute is plenty. */
const CACHE_TTL_MS = 60_000;
const SESSION_MINUTES = 5 * 60;
const WEEK_MINUTES = 7 * 24 * 60;

const PLAN_LABELS: Record<string, string> = {
  pro: "Claude Pro",
  max: "Claude Max",
  team: "Claude Team",
  enterprise: "Claude Enterprise",
};

interface ClaudeCredentials {
  accessToken: string;
  expiresAt: number | null;
  subscriptionType: string | null;
}

let cache: { key: string; expiresAt: number; provider: UsageLimitProvider | null } | null = null;

function parseCredentials(raw: string): ClaudeCredentials | null {
  try {
    const oauth = (JSON.parse(raw) as Record<string, unknown>)["claudeAiOauth"] as Record<string, unknown> | undefined;
    const accessToken = typeof oauth?.["accessToken"] === "string" ? oauth["accessToken"].trim() : "";
    if (!accessToken) return null;
    const expiresAt = Number(oauth?.["expiresAt"]);
    return {
      accessToken,
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
      subscriptionType: typeof oauth?.["subscriptionType"] === "string" ? oauth["subscriptionType"] : null,
    };
  } catch {
    return null;
  }
}

function readMacKeychain(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 3_000 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

async function readCredentials(home: string): Promise<ClaudeCredentials | null> {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  try {
    const fromFile = parseCredentials(fs.readFileSync(path.join(configDir, ".credentials.json"), "utf8"));
    if (fromFile) return fromFile;
  } catch {
    // no credentials file; macOS keeps them in the keychain
  }
  if (process.platform !== "darwin") return null;
  const fromKeychain = await readMacKeychain();
  return fromKeychain ? parseCredentials(fromKeychain) : null;
}

function toWindow(
  id: string,
  label: string,
  windowMinutes: number,
  raw: unknown,
  percentKey: "utilization" | "percent",
  now: number,
): UsageLimitWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const used = Number(value[percentKey]);
  if (value[percentKey] === null || !Number.isFinite(used)) return null;
  const resetsAt = Date.parse(String(value["resets_at"] ?? ""));
  const reset = Number.isFinite(resetsAt) && resetsAt > now ? resetsAt : null;
  return { id, label, usedPercent: Math.max(0, Math.min(100, used)), windowMinutes, resetsAt: reset };
}

/** Maps the `/api/oauth/usage` body (percentages are 0-100) to quota windows. */
export function claudeUsageToWindows(body: Record<string, unknown>, now: number): UsageLimitWindow[] {
  const windows: Array<UsageLimitWindow | null> = [
    toWindow("five_hour", "Session", SESSION_MINUTES, body["five_hour"], "utilization", now),
    toWindow("seven_day", "Weekly", WEEK_MINUTES, body["seven_day"], "utilization", now),
    toWindow("seven_day_opus", "Weekly · Opus", WEEK_MINUTES, body["seven_day_opus"], "utilization", now),
    toWindow("seven_day_sonnet", "Weekly · Sonnet", WEEK_MINUTES, body["seven_day_sonnet"], "utilization", now),
  ];
  const limits = Array.isArray(body["limits"]) ? (body["limits"] as Array<Record<string, unknown>>) : [];
  for (const limit of limits) {
    const scope = limit["scope"] as { model?: { display_name?: unknown } } | undefined;
    const model = typeof scope?.model?.display_name === "string" ? scope.model.display_name : null;
    if (limit["kind"] !== "weekly_scoped" || !model) continue;
    const id = `seven_day_${model.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    windows.push(toWindow(id, `Weekly · ${model}`, WEEK_MINUTES, limit, "percent", now));
  }
  // Older and newer response shapes can describe the same model window twice.
  const seen = new Set<string>();
  return windows.filter((window): window is UsageLimitWindow => {
    if (!window || seen.has(window.label)) return false;
    seen.add(window.label);
    return true;
  });
}

export async function readClaudeLimits(options: {
  home: string;
  now: number;
  fetchImpl?: typeof fetch;
}): Promise<UsageLimitProvider | null> {
  const { home, now } = options;
  if (cache && cache.key === home && cache.expiresAt > now) return cache.provider;

  const credentials = await readCredentials(home);
  // Not signed in with a Claude subscription (or API-key only): nothing to show.
  if (!credentials) return null;

  const base: UsageLimitProvider = {
    id: "claude-code",
    label: "Claude Code",
    plan: credentials.subscriptionType
      ? (PLAN_LABELS[credentials.subscriptionType] ?? credentials.subscriptionType)
      : null,
    observedAt: null,
    windows: [],
  };

  let provider: UsageLimitProvider;
  if (credentials.expiresAt !== null && credentials.expiresAt <= now) {
    provider = { ...base, error: "Claude Code sign-in expired. Run Claude Code once to refresh it." };
  } else {
    try {
      const response = await (options.fetchImpl ?? fetch)(USAGE_URL, {
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "user-agent": "argos-usage",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        provider = { ...base, error: `Could not load limits (HTTP ${response.status}).` };
      } else {
        const body = (await response.json()) as Record<string, unknown>;
        provider = { ...base, observedAt: now, windows: claudeUsageToWindows(body, now) };
      }
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError" ? "Request timed out." : "Network error.";
      provider = { ...base, error: `Could not load limits: ${message}` };
    }
  }

  // Cache failures briefly too, so a 429 isn't hammered on every refresh.
  cache = { key: home, expiresAt: now + CACHE_TTL_MS, provider };
  return provider;
}

/** Test hook. */
export function resetClaudeLimitsCache(): void {
  cache = null;
}
