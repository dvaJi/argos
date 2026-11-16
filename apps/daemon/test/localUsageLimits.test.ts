import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanLocalUsageLimits } from "../src/host/localUsageLimits";

const tempDirs: string[] = [];

function writeRollout(home: string, lines: unknown[]): void {
  const dir = path.join(home, ".codex", "sessions", "2026", "11", "15");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "rollout-test.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n"));
}

function tokenCount(timestamp: string, primaryUsed: number, primaryReset: number, secondaryReset: number) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      rate_limits: {
        primary: { used_percent: primaryUsed, window_minutes: 300, resets_at: primaryReset },
        secondary: { used_percent: 34, window_minutes: 10080, resets_at: secondaryReset },
        plan_type: "plus",
      },
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("scanLocalUsageLimits", () => {
  it("reads the newest Codex rate_limits snapshot", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    const now = Date.parse("2026-11-15T12:00:00Z");
    const nowSec = now / 1000;
    writeRollout(home, [
      tokenCount("2026-11-15T10:00:00Z", 10, nowSec + 3600, nowSec + 86400),
      tokenCount("2026-11-15T11:00:00Z", 40, nowSec + 3600, nowSec + 86400),
    ]);

    const [codex] = await scanLocalUsageLimits({ home, now });
    expect(codex).toMatchObject({ id: "codex", plan: "ChatGPT Plus" });
    expect(codex!.windows).toEqual([
      { id: "primary", label: "Session", usedPercent: 40, windowMinutes: 300, resetsAt: (nowSec + 3600) * 1000 },
      { id: "secondary", label: "Weekly", usedPercent: 34, windowMinutes: 10080, resetsAt: (nowSec + 86400) * 1000 },
    ]);
  });

  it("treats windows whose reset already passed as fully available", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    const now = Date.parse("2026-11-15T12:00:00Z");
    const nowSec = now / 1000;
    writeRollout(home, [tokenCount("2026-11-15T01:00:00Z", 80, nowSec - 60, nowSec + 86400)]);

    const [codex] = await scanLocalUsageLimits({ home, now });
    expect(codex!.windows[0]).toMatchObject({ usedPercent: 0, resetsAt: null });
  });

  it("finds a snapshot far before the tail, across chunk boundaries", async () => {
    const { readCodexRateLimits } = await import("../src/host/localUsageLimits");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    const filler = { timestamp: "2026-11-15T11:30:00Z", type: "response_item", payload: { text: "x".repeat(4000) } };
    writeRollout(home, [
      tokenCount("2026-11-15T11:00:00Z", 55, 2e9, 2e9),
      ...Array.from({ length: 200 }, () => filler),
    ]);
    const file = path.join(home, ".codex", "sessions", "2026", "11", "15", "rollout-test.jsonl");
    const snapshot = await readCodexRateLimits(file);
    expect((snapshot?.rateLimits["primary"] as { used_percent: number }).used_percent).toBe(55);
  });

  it("returns nothing without Codex logs", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    expect(await scanLocalUsageLimits({ home })).toEqual([]);
  });
});

describe("claude usage limits", () => {
  it("maps the OAuth usage body to quota windows", async () => {
    const { claudeUsageToWindows } = await import("../src/host/claudeUsageLimits");
    const now = Date.parse("2026-11-15T12:00:00Z");
    const windows = claudeUsageToWindows(
      {
        five_hour: { utilization: 40, resets_at: "2026-11-15T14:00:00Z" },
        seven_day: { utilization: 34, resets_at: "2026-11-18T00:00:00Z" },
        seven_day_opus: null,
        limits: [
          {
            kind: "weekly_scoped",
            percent: 10,
            resets_at: "2026-11-18T00:00:00Z",
            scope: { model: { display_name: "Fable" } },
          },
          { kind: "session", percent: 40 },
        ],
      },
      now,
    );
    expect(windows.map((window) => [window.label, window.usedPercent])).toEqual([
      ["Session", 40],
      ["Weekly", 34],
      ["Weekly · Fable", 10],
    ]);
    expect(windows[0]!.resetsAt).toBe(Date.parse("2026-11-15T14:00:00Z"));
  });

  it("reads the stored token, never refreshes, and reports HTTP errors", async () => {
    const { readClaudeLimits, resetClaudeLimitsCache } = await import("../src/host/claudeUsageLimits");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-claude-"));
    tempDirs.push(home);
    const now = Date.parse("2026-11-15T12:00:00Z");
    fs.mkdirSync(path.join(home, ".claude"));
    fs.writeFileSync(
      path.join(home, ".claude", ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt: now + 3_600_000, subscriptionType: "max" } }),
    );
    const previous = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    try {
      const calls: Array<[string, RequestInit | undefined]> = [];
      resetClaudeLimitsCache();
      const ok = await readClaudeLimits({
        home,
        now,
        fetchImpl: (async (url: string, init?: RequestInit) => {
          calls.push([url, init]);
          return new Response(JSON.stringify({ five_hour: { utilization: 12, resets_at: null } }));
        }) as typeof fetch,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]).toBe("https://api.anthropic.com/api/oauth/usage");
      expect(ok).toMatchObject({
        id: "claude-code",
        plan: "Claude Max",
        windows: [{ label: "Session", usedPercent: 12 }],
      });

      resetClaudeLimitsCache();
      const failed = await readClaudeLimits({
        home,
        now,
        fetchImpl: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
      });
      expect(failed?.error).toContain("429");
      expect(failed?.windows).toEqual([]);
    } finally {
      if (previous !== undefined) process.env.CLAUDE_CONFIG_DIR = previous;
      resetClaudeLimitsCache();
    }
  });
});
