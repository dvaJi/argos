import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { UsageStatRecord } from "./bun-session-repository";

/**
 * Scans local agent session JSONL files (Codex + Claude Code) for usage data —
 * the same approach t3code's Usage page uses. This is the fallback for agents
 * that don't report ACP `usage_update`: Argos can't see their per-turn usage
 * through the protocol, but their local session history records it.
 *
 * Costs are NOT in these files; we compute an estimate from token counts +
 * model pricing (per-MTok), same convention as the rest of the usage view.
 */

export interface LocalUsageSource {
  id: string;
  label: string;
  sessionDir: (home: string) => string;
  /** Parse a session file into usage records. */
  parseFile?: (filePath: string, sourceId: string) => UsageStatRecord[];
  /** Parse a SQLite database into usage records (OpenCode-fork family). */
  parseDb?: (dbPath: string, sourceId: string) => UsageStatRecord[];
  /** Optional explicit DB path instead of a session dir scan. */
  dbPath?: (home: string) => string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Short-TTL cache so repeated `usage.getStats` calls don't rescan local
 * session files synchronously (the scan reads many JSONL files). Keyed by
 * home dir + window duration; invalidated by time bucket. */
const SCAN_CACHE_TTL_MS = 10_000;
const scanCache = new Map<string, { expiresAt: number; records: UsageStatRecord[] }>();

function scanCacheKey(home: string, windowMs: number, now: number): string {
  const bucket = Math.floor(now / SCAN_CACHE_TTL_MS) * SCAN_CACHE_TTL_MS;
  return `${home}|${windowMs}|${bucket}`;
}

function toDateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function tokenNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Currency-safe number: preserves decimals (costs are not token counts). */
function costNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Read a SQLite database via `bun:sqlite` (native to the daemon). Returns rows
 * or [] when the file is missing / not a valid DB / unreadable.
 */
function readSqliteRows(dbPath: string, sql: string): Array<Record<string, unknown>> {
  try {
    if (!fs.existsSync(dbPath)) return [];
    // Dynamic import keeps this out of the hot path and avoids a hard dep when
    // no SQLite source is present.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
    const db = new Database(dbPath, { readonly: true });
    try {
      const stmt = db.prepare(sql);
      return stmt.all() as Array<Record<string, unknown>>;
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Codex session files: one JSON per line. Usage comes from `event_msg` with
 * `payload.type === "token_count"` → `payload.info.total_token_usage`
 * (cumulative per turn). Some versions also attach `usage` to `response_item`
 * payloads (messages / function_call_output). */
export function parseCodexSessionFile(filePath: string, sourceId: string): UsageStatRecord[] {
  const records: UsageStatRecord[] = [];
  let sessionModel = "";
  let firstTimestamp = 0;
  const usageByModel = new Map<
    string,
    { input: number; cachedRead: number; cacheWrite: number; output: number; reasoning: number; total: number }
  >();

  const bump = (model: string, usage: Record<string, unknown>, cumulative: boolean) => {
    if (!model) return;
    const bucket = usageByModel.get(model) ?? {
      input: 0,
      cachedRead: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      total: 0,
    };
    // `event_msg.token_count` is cumulative per turn; take the latest value.
    // `response_item.usage` is per-item; sum.
    const next = {
      input: tokenNumber(usage["input_tokens"]),
      cachedRead: tokenNumber(
        usage["cache_read_input_tokens"] ?? usage["cached_input_tokens"] ?? usage["cached_tokens"],
      ),
      cacheWrite: tokenNumber(usage["cache_write_input_tokens"] ?? usage["cache_creation_input_tokens"]),
      output: tokenNumber(usage["output_tokens"]),
      reasoning: tokenNumber(usage["reasoning_tokens"] ?? usage["reasoning_output_tokens"]),
      total: tokenNumber(usage["total_tokens"]),
    };
    if (cumulative) {
      bucket.input = next.input;
      bucket.cachedRead = next.cachedRead;
      bucket.cacheWrite = next.cacheWrite;
      bucket.output = next.output;
      bucket.reasoning = next.reasoning;
      bucket.total = next.total;
    } else {
      bucket.input += next.input;
      bucket.cachedRead += next.cachedRead;
      bucket.cacheWrite += next.cacheWrite;
      bucket.output += next.output;
      bucket.reasoning += next.reasoning;
      bucket.total += next.total;
    }
    usageByModel.set(model, bucket);
  };

  for (const line of readLines(filePath)) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const tsRaw = entry["timestamp"];
    const tsNum = typeof tsRaw === "number" ? tsRaw * 1000 : typeof tsRaw === "string" ? Date.parse(tsRaw) : NaN;
    if (Number.isFinite(tsNum) && !firstTimestamp) firstTimestamp = tsNum;

    const payload = (entry["payload"] ?? entry) as Record<string, unknown>;
    const model =
      typeof payload["model"] === "string"
        ? payload["model"]
        : typeof entry["model"] === "string"
          ? (entry["model"] as string)
          : "";
    if (model) sessionModel = model;

    // Model also appears in turn_context and thread_settings_applied events.
    if (!model && entry["type"] === "turn_context" && typeof payload["model"] === "string") {
      sessionModel = payload["model"] as string;
    }
    if (!model && entry["type"] === "event_msg" && payload["type"] === "thread_settings_applied") {
      const settings = (payload["thread_settings"] ?? {}) as Record<string, unknown>;
      if (typeof settings["model"] === "string") sessionModel = settings["model"] as string;
    }

    // Case 1: event_msg token_count → payload.info.total_token_usage (cumulative)
    if (entry["type"] === "event_msg" && payload["type"] === "token_count") {
      const info = (payload["info"] ?? {}) as Record<string, unknown>;
      const usage = (info["total_token_usage"] ?? info["last_token_usage"]) as Record<string, unknown> | undefined;
      if (usage && typeof usage === "object") {
        bump(model || sessionModel || "codex", usage as Record<string, unknown>, true);
      }
      continue;
    }

    // Case 2: response_item with a per-item usage object
    const usage = (payload["usage"] ?? entry["usage"]) as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      bump(model || sessionModel || "codex", usage as Record<string, unknown>, false);
    }
  }

  for (const [model, u] of usageByModel) {
    if (u.input + u.output + u.cachedRead + u.cacheWrite <= 0) continue;
    records.push(
      buildRecord({
        sourceId,
        filePath,
        model,
        inputTokens: u.input,
        cachedInputTokens: u.cachedRead,
        cacheWriteInputTokens: u.cacheWrite,
        outputTokens: u.output,
        reasoningTokens: u.reasoning,
        totalTokens: u.total || u.input + u.output + u.cachedRead + u.cacheWrite,
        createdAtMs: firstTimestamp || fileMtimeMs(filePath),
      }),
    );
  }
  return records;
}

/** Claude Code session files: one JSON per line with `assistant`/`user` messages carrying `message.usage`. */
export function parseClaudeSessionFile(filePath: string, sourceId: string): UsageStatRecord[] {
  const records: UsageStatRecord[] = [];
  let sessionModel = "";
  let firstTimestamp = 0;
  const usageByModel = new Map<
    string,
    { input: number; cachedRead: number; cacheWrite: number; output: number; reasoning: number; total: number }
  >();

  const bump = (model: string, usage: Record<string, unknown>) => {
    if (!model) return;
    const bucket = usageByModel.get(model) ?? {
      input: 0,
      cachedRead: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      total: 0,
    };
    bucket.input += tokenNumber(usage["input_tokens"]);
    bucket.cachedRead += tokenNumber(usage["cache_read_input_tokens"]);
    bucket.cacheWrite += tokenNumber(usage["cache_creation_input_tokens"]);
    bucket.output += tokenNumber(usage["output_tokens"]);
    bucket.reasoning += tokenNumber(usage["reasoning_tokens"]);
    bucket.total += tokenNumber(usage["total_tokens"]);
    usageByModel.set(model, bucket);
  };

  for (const line of readLines(filePath)) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const tsRaw = entry["timestamp"];
    const tsNum = typeof tsRaw === "number" ? tsRaw : typeof tsRaw === "string" ? Date.parse(tsRaw) : NaN;
    if (Number.isFinite(tsNum) && !firstTimestamp) firstTimestamp = tsNum;

    const msg = (entry["message"] ?? entry) as Record<string, unknown>;
    const model = typeof msg["model"] === "string" ? (msg["model"] as string) : "";
    if (model) sessionModel = model;

    const usage = msg["usage"] as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      bump(model || sessionModel, usage as Record<string, unknown>);
    }
  }

  for (const [model, u] of usageByModel) {
    if (u.input + u.output + u.cachedRead + u.cacheWrite <= 0) continue;
    records.push(
      buildRecord({
        sourceId,
        filePath,
        model,
        inputTokens: u.input,
        cachedInputTokens: u.cachedRead,
        cacheWriteInputTokens: u.cacheWrite,
        outputTokens: u.output,
        reasoningTokens: u.reasoning,
        totalTokens: u.total || u.input + u.output + u.cachedRead + u.cacheWrite,
        createdAtMs: firstTimestamp || fileMtimeMs(filePath),
      }),
    );
  }
  return records;
}

/** OpenCode-fork SQLite reader (OpenCode, Kilo CLI, Mimo, ZCode, Qoder).
 * The `message` table stores JSON `data` with `tokens` and `cost`; the
 * `tokens` object is `{total, input, output, reasoning, cache:{write,read}}`
 * and `time.created` is epoch ms. OpenCode stores the model id per session in
 * the `session.model` column, so per-model attribution comes from the session. */
export function parseOpencodeDb(dbPath: string, sourceId: string): UsageStatRecord[] {
  const rows = readSqliteRows(
    dbPath,
    `SELECT session_id, data FROM message WHERE data IS NOT NULL ORDER BY time_created ASC`,
  );
  const records: UsageStatRecord[] = [];

  // OpenCode stores the model id per session (JSON string in the `model` column); messages only carry session_id.
  const modelBySession = new Map<string, string>();
  for (const session of readSqliteRows(dbPath, `SELECT id, model FROM session WHERE model IS NOT NULL`)) {
    const raw = session["model"];
    let modelId = "";
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as { id?: unknown };
        modelId = typeof parsed.id === "string" ? parsed.id : "";
      } catch {
        modelId = raw;
      }
    }
    if (modelId) modelBySession.set(String(session["id"]), modelId);
  }

  let firstTimestamp = 0;
  let input = 0;
  let cachedRead = 0;
  let cacheWrite = 0;
  let output = 0;
  let reasoning = 0;
  let total = 0;
  let reportedCost = 0;
  let modelId = sourceId;

  for (const row of rows) {
    const data = row["data"];
    let parsed: Record<string, unknown>;
    try {
      parsed =
        typeof data === "string" ? (JSON.parse(data) as Record<string, unknown>) : (data as Record<string, unknown>);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const sessionModel = modelBySession.get(String(row["session_id"]));
    if (sessionModel) modelId = sessionModel;

    const time = (parsed["time"] ?? {}) as Record<string, unknown>;
    const created = typeof time["created"] === "number" ? (time["created"] as number) : 0;
    if (created > 0 && !firstTimestamp) firstTimestamp = created;

    const role = parsed["role"];
    if (role !== "assistant") continue;

    const tokens = (parsed["tokens"] ?? {}) as Record<string, unknown>;
    const cache = (tokens["cache"] ?? {}) as Record<string, unknown>;
    input += tokenNumber(tokens["input"]);
    cachedRead += tokenNumber(cache["read"]);
    cacheWrite += tokenNumber(cache["write"]);
    output += tokenNumber(tokens["output"]);
    reasoning += tokenNumber(tokens["reasoning"]);
    total += tokenNumber(tokens["total"]);

    const cost = parsed["cost"];
    const costValue =
      typeof cost === "number"
        ? cost
        : typeof cost === "object" && cost !== null
          ? costNumber((cost as Record<string, unknown>)["total"])
          : 0;
    if (costValue > 0) reportedCost += costValue;
  }

  if (input + output + cachedRead + cacheWrite > 0) {
    records.push(
      buildRecord({
        sourceId,
        filePath: dbPath,
        model: modelId || sourceId,
        inputTokens: input,
        cachedInputTokens: cachedRead,
        cacheWriteInputTokens: cacheWrite,
        outputTokens: output,
        reasoningTokens: reasoning,
        totalTokens: total || input + output + cachedRead + cacheWrite,
        createdAtMs: firstTimestamp || fileMtimeMs(dbPath),
        reportedCostUsd: reportedCost > 0 ? reportedCost : undefined,
      }),
    );
  }
  return records;
}

/** Gemini CLI / Antigravity transcript JSONL: assistant entries carry usage. */
export function parseGeminiSessionFile(filePath: string, sourceId: string): UsageStatRecord[] {
  const records: UsageStatRecord[] = [];
  let firstTimestamp = 0;
  const usageByModel = new Map<
    string,
    { input: number; cachedRead: number; cacheWrite: number; output: number; reasoning: number; total: number }
  >();

  for (const line of readLines(filePath)) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const tsRaw = entry["timestamp"];
    const tsNum = typeof tsRaw === "number" ? tsRaw : typeof tsRaw === "string" ? Date.parse(tsRaw) : NaN;
    if (Number.isFinite(tsNum) && !firstTimestamp) firstTimestamp = tsNum;

    const role = entry["role"];
    if (role !== "assistant") continue;

    const model = typeof entry["model"] === "string" ? (entry["model"] as string) : "";
    const usage = (entry["usage"] ?? {}) as Record<string, unknown>;
    if (!usage || typeof usage !== "object") continue;

    const bucket = usageByModel.get(model || "gemini") ?? {
      input: 0,
      cachedRead: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      total: 0,
    };
    bucket.input += tokenNumber(usage["input_tokens"] ?? usage["prompt_tokens"]);
    bucket.cachedRead += tokenNumber(usage["cache_read_input_tokens"] ?? usage["cached_input_tokens"]);
    bucket.cacheWrite += tokenNumber(usage["cache_creation_input_tokens"]);
    bucket.output += tokenNumber(usage["output_tokens"] ?? usage["completion_tokens"]);
    bucket.reasoning += tokenNumber(usage["reasoning_tokens"]);
    bucket.total += tokenNumber(usage["total_tokens"]);
    usageByModel.set(model || "gemini", bucket);
  }

  for (const [model, u] of usageByModel) {
    if (u.input + u.output + u.cachedRead + u.cacheWrite <= 0) continue;
    records.push(
      buildRecord({
        sourceId,
        filePath,
        model,
        inputTokens: u.input,
        cachedInputTokens: u.cachedRead,
        cacheWriteInputTokens: u.cacheWrite,
        outputTokens: u.output,
        reasoningTokens: u.reasoning,
        totalTokens: u.total || u.input + u.output + u.cachedRead + u.cacheWrite,
        createdAtMs: firstTimestamp || fileMtimeMs(filePath),
      }),
    );
  }
  return records;
}

function buildRecord(params: {
  sourceId: string;
  filePath: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  createdAtMs: number;
  reportedCostUsd?: number;
}): UsageStatRecord {
  const usageDate = toDateKey(params.createdAtMs);
  const messageId = `${params.sourceId}:${params.filePath}:${params.model}`;
  return {
    messageId,
    sessionId: `${params.sourceId}:${params.filePath}`,
    providerId: params.sourceId,
    modelId: params.model,
    usageDate,
    inputTokens: params.inputTokens,
    cachedInputTokens: params.cachedInputTokens,
    cacheWriteInputTokens: params.cacheWriteInputTokens,
    outputTokens: params.outputTokens,
    reasoningTokens: params.reasoningTokens,
    totalTokens: params.totalTokens,
    costUsd: params.reportedCostUsd ?? null, // estimated later when no reported cost is available
    costSource: params.reportedCostUsd !== undefined ? "reported" : "estimated",
    createdAt: params.createdAtMs,
  };
}

function readLines(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n");
  } catch {
    return [];
  }
}

function fileMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return Date.now();
  }
}

export const LOCAL_USAGE_SOURCES: LocalUsageSource[] = [
  {
    id: "codex",
    label: "Codex",
    sessionDir: (home) => path.join(home, ".codex", "sessions"),
    parseFile: parseCodexSessionFile,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    sessionDir: (home) => path.join(home, ".claude", "projects"),
    parseFile: parseClaudeSessionFile,
  },
  {
    id: "opencode",
    label: "OpenCode",
    sessionDir: (home) => path.join(home, ".local", "share", "opencode"),
    dbPath: (home) => path.join(home, ".local", "share", "opencode", "opencode.db"),
    parseDb: parseOpencodeDb,
  },
  {
    id: "gemini",
    label: "Gemini",
    sessionDir: (home) => path.join(home, ".gemini"),
    parseFile: parseGeminiSessionFile,
  },
];

/** Recursively list `.jsonl` files under a directory. */
export function listJsonlFiles(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...listJsonlFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(full);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Scans all local agent session files and returns usage records, newest first.
 * Only includes sessions modified within `windowMs` of `now` (like the 24h/7d/30d/90d windows).
 */
export function scanLocalUsage(
  options: {
    home?: string;
    windowMs?: number;
    now?: number;
    maxFiles?: number;
  } = {},
): UsageStatRecord[] {
  // ARGOS_USAGE_HOME lets tests (and users) point the scan at a specific home
  // dir instead of the real os.homedir().
  const home = options.home ?? process.env.ARGOS_USAGE_HOME ?? os.homedir();
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? 30 * MS_PER_DAY;
  const maxFiles = options.maxFiles ?? 5000;

  // Serve recent scans from the TTL cache so the usage route doesn't block the
  // event loop re-reading every session file on each request.
  const cacheKey = scanCacheKey(home, windowMs, now);
  const cached = scanCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.records;
  }

  const records: UsageStatRecord[] = [];

  for (const source of LOCAL_USAGE_SOURCES) {
    // SQLite sources: read the single DB file directly.
    if (source.parseDb) {
      const dbPath = source.dbPath?.(home) ?? source.sessionDir(home);
      const mtime = fileMtimeMs(dbPath);
      if (now - mtime <= windowMs) {
        try {
          records.push(...source.parseDb(dbPath, source.id));
        } catch {
          // skip unreadable/corrupt DBs
        }
      }
      continue;
    }

    // JSONL sources: scan the session dir recursively. Filter by mtime BEFORE
    // capping so recent sessions are never dropped by directory order.
    const dir = source.sessionDir(home);
    const files = listJsonlFiles(dir)
      .map((filePath) => ({ filePath, mtime: fileMtimeMs(filePath) }))
      .filter((entry) => now - entry.mtime <= windowMs)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, maxFiles);
    for (const { filePath } of files) {
      try {
        records.push(...source.parseFile!(filePath, source.id));
      } catch {
        // skip unreadable/corrupt files
      }
    }
  }

  records.sort((a, b) => b.createdAt - a.createdAt);
  scanCache.set(cacheKey, { expiresAt: now + SCAN_CACHE_TTL_MS, records });
  return records;
}
