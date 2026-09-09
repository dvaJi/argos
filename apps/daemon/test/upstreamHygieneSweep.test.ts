import { describe, expect, it, beforeEach, afterEach, vi } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BunSessionRepository } from "../src/host/bun-session-repository";
import { DaemonConfigPresenter } from "../src/host/daemonConfigPresenter";
import { AcpLaunchSpecService } from "@argos/acp-runtime/config/acpLaunchSpecService";

/**
 * Hygiene sweep (docs/issues/upstream-hygiene-sweep):
 * - pending-input queue limit raised to 10 (DeepChat #2236)
 * - concurrent model discovery coalesces into one upstream request (#2248)
 * - failed downloads release the response body before throwing (#2251)
 */

describe("pending input queue limit", () => {
  let repo: BunSessionRepository;
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new BunSessionRepository(db as never);
    db.run(
      `INSERT INTO daemon_sessions (id, agent_id, title, status, generation_status, created_at, updated_at)
       VALUES (?, 'argos', 'Test', 'idle', 'idle', ?, ?)`,
      ["session-1", Date.now(), Date.now()],
    );
  });

  it("accepts a queue of 10 and rejects the 11th", async () => {
    for (let index = 0; index < 10; index += 1) {
      await expect(
        repo.queuePendingInput("session-1", `message ${index}`, { source: "queue" } as never),
      ).resolves.toBeTruthy();
    }

    await expect(repo.queuePendingInput("session-1", "message 11", { source: "queue" } as never)).rejects.toThrow(
      "Pending input limit reached",
    );
  });
});

describe("model discovery coalescing", () => {
  const originalFetch = globalThis.fetch;
  const roots: string[] = [];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const tempRoot = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-hygiene-"));
    roots.push(dir);
    return dir;
  };

  it("coalesces concurrent refreshes for the same provider into one upstream call", async () => {
    const dataDir = tempRoot();
    const presenter = new DaemonConfigPresenter(dataDir, dataDir);
    presenter.setProviders([
      {
        id: "prov-1",
        name: "Coalesced Provider",
        type: "openai",
        apiType: "openai",
        baseUrl: "https://models.example.invalid/v1",
        apiKey: "sk-test",
      } as never,
    ]);

    let upstreamCalls = 0;
    globalThis.fetch = (async () => {
      upstreamCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(JSON.stringify({ data: [{ id: "model-a", name: "Model A" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const [first, second, third] = await Promise.all([
      presenter.refreshProviderModels("prov-1"),
      presenter.refreshProviderModels("prov-1"),
      presenter.refreshProviderModels("prov-1"),
    ]);

    expect(upstreamCalls).toBe(1);
    expect(first.map((model) => model.id)).toEqual(["model-a"]);
    expect(second).toBe(first);
    expect(third).toBe(first);

    // After the coalesced call settles, a new call is a fresh refresh.
    const fourth = await presenter.refreshProviderModels("prov-1");
    expect(upstreamCalls).toBe(2);
    expect(fourth).not.toBe(first);
  });

  it("does not coalesce different providers", async () => {
    const dataDir = tempRoot();
    const presenter = new DaemonConfigPresenter(dataDir, dataDir);
    presenter.setProviders([
      {
        id: "prov-1",
        name: "P1",
        type: "openai",
        apiType: "openai",
        baseUrl: "https://a.example.invalid/v1",
        apiKey: "k",
      } as never,
      {
        id: "prov-2",
        name: "P2",
        type: "openai",
        apiType: "openai",
        baseUrl: "https://b.example.invalid/v1",
        apiKey: "k",
      } as never,
    ]);

    let upstreamCalls = 0;
    globalThis.fetch = (async () => {
      upstreamCalls += 1;
      return new Response(JSON.stringify({ data: [{ id: "m" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await Promise.all([presenter.refreshProviderModels("prov-1"), presenter.refreshProviderModels("prov-2")]);
    expect(upstreamCalls).toBe(2);
  });
});

describe("download archive response release", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("cancels the error body and throws on a failed archive download", async () => {
    const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "argos-hygiene-acp-"));
    const service = new AcpLaunchSpecService(registryRoot);
    const cancel = vi.fn(async () => undefined);

    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        body: { cancel },
      } as unknown as Response;
    }) as typeof fetch;

    await expect(
      (service as any).downloadArchive("https://mirror.example.invalid/agent.zip", { id: "agent-1" }),
    ).rejects.toThrow("Failed to download archive");
    expect(cancel).toHaveBeenCalled();

    fs.rmSync(registryRoot, { recursive: true, force: true });
  });
});
