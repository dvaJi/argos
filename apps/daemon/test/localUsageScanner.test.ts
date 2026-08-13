import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseCodexSessionFile,
  parseClaudeSessionFile,
  parseGeminiSessionFile,
  scanLocalUsage,
  listJsonlFiles,
} from "../src/host/localUsageScanner";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-usage-scan-"));
  dirs.push(dir);
  return dir;
}

describe("parseCodexSessionFile", () => {
  it("aggregates response_item usage per model", () => {
    const dir = tmpDir();
    const file = path.join(dir, "session-1.jsonl");
    const now = Date.now();
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            model: "gpt-5.2-codex",
            usage: {
              input_tokens: 1000,
              cache_read_input_tokens: 200,
              cache_write_input_tokens: 100,
              output_tokens: 300,
              reasoning_tokens: 50,
              total_tokens: 1300,
            },
          },
          timestamp: Math.floor(now / 1000),
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "function_call_output",
            usage: {
              input_tokens: 500,
              cache_read_input_tokens: 100,
              output_tokens: 0,
              total_tokens: 500,
            },
          },
          timestamp: Math.floor(now / 1000) + 1,
        }),
      ].join("\n"),
    );

    const records = parseCodexSessionFile(file, "codex");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      providerId: "codex",
      modelId: "gpt-5.2-codex",
      inputTokens: 1500,
      cachedInputTokens: 300,
      cacheWriteInputTokens: 100,
      outputTokens: 300,
      reasoningTokens: 50,
      totalTokens: 1800,
      costSource: "estimated",
      costUsd: null,
    });
  });

  it("skips malformed lines and files without usage", () => {
    const dir = tmpDir();
    const file = path.join(dir, "empty.jsonl");
    fs.writeFileSync(file, 'not json\n{"type":"response_item","payload":{}}\n');
    expect(parseCodexSessionFile(file, "codex")).toEqual([]);
  });

  it("handles the real event_msg token_count format (cumulative, model from turn_context)", () => {
    const dir = tmpDir();
    const file = path.join(dir, "rollout.jsonl");
    const now = Date.now();
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          type: "session_meta",
          payload: { model_provider: "openai", session_id: "s1" },
        }),
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          type: "turn_context",
          payload: { model: "gpt-5.6-luna", turn_id: "t1" },
        }),
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 1000,
                cached_input_tokens: 200,
                output_tokens: 50,
                reasoning_output_tokens: 10,
                total_tokens: 1000,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 3000,
                cached_input_tokens: 800,
                output_tokens: 150,
                reasoning_output_tokens: 30,
                total_tokens: 3000,
              },
            },
          },
        }),
      ].join("\n"),
    );

    const records = parseCodexSessionFile(file, "codex");
    expect(records).toHaveLength(1);
    // Cumulative: last token_count wins (3000/800/150/30), not summed.
    expect(records[0]).toMatchObject({
      providerId: "codex",
      modelId: "gpt-5.6-luna",
      inputTokens: 3000,
      cachedInputTokens: 800,
      outputTokens: 150,
      reasoningTokens: 30,
      totalTokens: 3000,
    });
  });
});

describe("parseClaudeSessionFile", () => {
  it("aggregates message usage per model", () => {
    const dir = tmpDir();
    const file = path.join(dir, "proj", "session-1.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = Date.now();
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-opus-4-5",
            usage: {
              input_tokens: 2000,
              cache_read_input_tokens: 500,
              cache_creation_input_tokens: 300,
              output_tokens: 400,
              total_tokens: 2400,
            },
          },
          timestamp: new Date(now).toISOString(),
        }),
      ].join("\n"),
    );

    const records = parseClaudeSessionFile(file, "claude-code");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      providerId: "claude-code",
      modelId: "claude-opus-4-5",
      inputTokens: 2000,
      cachedInputTokens: 500,
      cacheWriteInputTokens: 300,
      outputTokens: 400,
      totalTokens: 2400,
    });
  });
});

describe("parseGeminiSessionFile", () => {
  it("aggregates assistant usage per model", () => {
    const dir = tmpDir();
    const file = path.join(dir, "gemini", "brain", "transcript.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = Date.now();
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          timestamp: new Date(now - 1000).toISOString(),
          role: "user",
          content: "hi",
        }),
        JSON.stringify({
          timestamp: new Date(now).toISOString(),
          role: "assistant",
          model: "gemini-2.5-pro",
          usage: {
            input_tokens: 1200,
            cache_read_input_tokens: 400,
            output_tokens: 300,
            reasoning_tokens: 80,
            total_tokens: 1500,
          },
        }),
      ].join("\n"),
    );

    const records = parseGeminiSessionFile(file, "gemini");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      providerId: "gemini",
      modelId: "gemini-2.5-pro",
      inputTokens: 1200,
      cachedInputTokens: 400,
      outputTokens: 300,
      reasoningTokens: 80,
      totalTokens: 1500,
    });
  });
});

describe("scanLocalUsage", () => {
  it("discovers jsonl files recursively and filters by window", () => {
    const home = tmpDir();
    const codexDir = path.join(home, ".codex", "sessions");
    const claudeDir = path.join(home, ".claude", "projects", "p1");
    fs.mkdirSync(codexDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });

    const now = Date.now();
    // recent codex file
    fs.writeFileSync(
      path.join(codexDir, "recent.jsonl"),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          model: "gpt-5.2-codex",
          usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        },
        timestamp: Math.floor(now / 1000),
      }),
    );
    // stale claude file (older than 7d)
    const stale = path.join(claudeDir, "stale.jsonl");
    fs.writeFileSync(
      stale,
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-5",
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    // age the stale file's mtime past the window so it fails the mtime filter
    const past = new Date(now - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stale, past, past);

    expect(listJsonlFiles(codexDir)).toHaveLength(1);

    const records = scanLocalUsage({ home, windowMs: 7 * 24 * 60 * 60 * 1000, now });
    // Only the codex file passes the mtime window (stale claude file has old mtime).
    expect(records.some((r) => r.modelId === "gpt-5.2-codex")).toBe(true);
    expect(records.some((r) => r.modelId === "claude-opus-4-5")).toBe(false);
  });
});
