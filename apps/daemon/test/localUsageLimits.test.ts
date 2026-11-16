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
  it("reads the newest Codex rate_limits snapshot", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    const now = Date.parse("2026-11-15T12:00:00Z");
    const nowSec = now / 1000;
    writeRollout(home, [
      tokenCount("2026-11-15T10:00:00Z", 10, nowSec + 3600, nowSec + 86400),
      tokenCount("2026-11-15T11:00:00Z", 40, nowSec + 3600, nowSec + 86400),
    ]);

    const [codex] = scanLocalUsageLimits({ home, now });
    expect(codex).toMatchObject({ id: "codex", plan: "ChatGPT Plus" });
    expect(codex!.windows).toEqual([
      { id: "primary", label: "Session", usedPercent: 40, windowMinutes: 300, resetsAt: (nowSec + 3600) * 1000 },
      { id: "secondary", label: "Weekly", usedPercent: 34, windowMinutes: 10080, resetsAt: (nowSec + 86400) * 1000 },
    ]);
  });

  it("treats windows whose reset already passed as fully available", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    const now = Date.parse("2026-11-15T12:00:00Z");
    const nowSec = now / 1000;
    writeRollout(home, [tokenCount("2026-11-15T01:00:00Z", 80, nowSec - 60, nowSec + 86400)]);

    const [codex] = scanLocalUsageLimits({ home, now });
    expect(codex!.windows[0]).toMatchObject({ usedPercent: 0, resetsAt: null });
  });

  it("returns nothing without Codex logs", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "argos-limits-"));
    tempDirs.push(home);
    expect(scanLocalUsageLimits({ home })).toEqual([]);
  });
});
