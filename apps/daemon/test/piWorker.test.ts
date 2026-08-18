import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { afterEach, describe, expect, it } from "bun:test";
import type { PiWorkerEvent, PiWorkerInit } from "../src/host/piWorkerProtocol";
import { PiAgentProfileManager } from "../src/host/piAgentProfileManager";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Pi worker", () => {
  it("starts an isolated SDK session and reports its JSONL file", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-pi-worker-"));
    directories.push(dataDir);
    const profiles = new PiAgentProfileManager(dataDir);
    const agentDir = profiles.ensureProfile("test-agent");
    const workerPath = path.resolve(import.meta.dirname, "../src/host/piWorker.ts");
    const child = spawn(process.execPath, [workerPath], { stdio: ["pipe", "pipe", "pipe"] });
    const errors: string[] = [];
    child.stderr.on("data", (chunk) => errors.push(String(chunk)));

    const ready = new Promise<Extract<PiWorkerEvent, { type: "ready" }>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Worker timed out: ${errors.join("")}`)), 10_000);
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        let event: PiWorkerEvent;
        try {
          event = JSON.parse(line) as PiWorkerEvent;
        } catch {
          errors.push(`Unexpected worker stdout: ${line}\n`);
          return;
        }
        if (event.type === "ready") {
          clearTimeout(timeout);
          resolve(event);
        }
        if (event.type === "error" && typeof event.message === "string") {
          clearTimeout(timeout);
          errors.push(`Worker error event: ${line}\n`);
          reject(new Error(`Pi worker reported an error during initialization: ${line}`));
        } else if (event.type === "error") {
          errors.push(`Malformed worker error event: ${line}\n`);
        }
      });
    });

    const command: PiWorkerInit = {
      type: "init",
      sessionId: "session-one",
      cwd: dataDir,
      agentDir,
      sessionDir: profiles.getSessionDir("test-agent"),
      provider: {
        id: "test-provider",
        name: "Test Provider",
        api: "openai",
        apiKey: "test-key",
        baseUrl: "http://127.0.0.1:1/v1",
        model: {
          id: "test-model",
          name: "Test Model",
          reasoning: false,
          input: ["text"],
          contextWindow: 8_192,
          maxTokens: 1_024,
          samplingParams: { temperature: 0.3, top_p: 0.9 },
        },
      },
      disabledTools: [],
      tools: [],
      orchestrationTools: [],
      projectTrusted: false,
      permissionMode: "default",
      profileFingerprint: "test",
    };
    child.stdin.write(`${JSON.stringify(command)}\n`);

    try {
      const event = await ready;
      expect(event.sessionFile).toContain(".jsonl");
      expect(path.dirname(event.sessionFile!)).toBe(profiles.getSessionDir("test-agent"));
    } finally {
      child.stdin.write(`${JSON.stringify({ type: "dispose" })}\n`);
      child.kill();
    }
  }, 20_000);
});
