import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEarlyServer, type DaemonRequestHandlers, type EarlyServer } from "../src/index";

// Requests use Bun.fetch, not the global fetch: other test files replace
// globalThis.fetch with mocks and the suite shares one process.
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function start(webRoot: string | null = null): { early: EarlyServer; base: string; wsBase: string } {
  const early = startEarlyServer({ host: "127.0.0.1", port: 0, webRoot });
  cleanups.push(() => (early.server as any).stop(true));
  const port = (early.server as any).port as number;
  return { early, base: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}` };
}

function readyHandlers(log: string[] = []): DaemonRequestHandlers {
  return {
    fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json({ status: "ok" });
      if (url.pathname === "/api/v1/events") {
        return server.upgrade(request, { data: {} })
          ? (undefined as unknown as Response)
          : new Response("upgrade failed", { status: 500 });
      }
      return Response.json({ ok: true, path: url.pathname });
    },
    websocket: {
      open(ws) {
        log.push("open");
        ws.send(JSON.stringify({ type: "welcome" }));
      },
      close() {
        log.push("close");
      },
      message(ws, message) {
        log.push(`message:${String(message)}`);
        ws.send(`echo:${String(message)}`);
      },
    },
  };
}

/** Resolves to "pending" if the promise has not settled after `ms`. */
function settledWithin<T>(promise: Promise<T>, ms: number): Promise<T | "pending"> {
  return Promise.race([promise, new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms))]);
}

describe("startEarlyServer", () => {
  it("reports starting on /health and serves the web UI before activation", async () => {
    const webRoot = mkdtempSync(join(tmpdir(), "argos-early-web-"));
    cleanups.push(() => rmSync(webRoot, { recursive: true, force: true }));
    writeFileSync(join(webRoot, "index.html"), "<html>early</html>");
    const { early, base } = start(webRoot);

    const health = await Bun.fetch(`${base}/health`);
    expect(health.status).toBe(503);
    expect(((await health.json()) as { status: string }).status).toBe("starting");

    const index = await Bun.fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toBe("<html>early</html>");

    const preflight = await Bun.fetch(`${base}/api/v1/route`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);

    early.activate(readyHandlers());
    const ready = await Bun.fetch(`${base}/health`);
    expect(ready.status).toBe(200);
    expect(((await ready.json()) as { status: string }).status).toBe("ok");
  });

  it("holds API requests until activation instead of answering early", async () => {
    const { early, base } = start();

    const pending = Bun.fetch(`${base}/api/v1/route`, { method: "POST", body: "{}" });
    expect(await settledWithin(pending, 150)).toBe("pending");

    early.activate(readyHandlers());
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, path: "/api/v1/route" });
  });

  it("holds a WebSocket upgrade until activation, then delivers messages", async () => {
    const { early, wsBase } = start();
    const log: string[] = [];

    const ws = new WebSocket(`${wsBase}/api/v1/events`);
    cleanups.push(() => ws.close());
    const messages: string[] = [];
    const opened = new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("websocket failed"));
    });
    const nextMessage = () =>
      new Promise<string>((resolve) => {
        ws.onmessage = (event) => {
          messages.push(String(event.data));
          resolve(String(event.data));
        };
      });
    const welcome = nextMessage();

    expect(await settledWithin(opened, 150)).toBe("pending");
    expect(log).toEqual([]);

    early.activate(readyHandlers(log));
    await opened;
    expect(JSON.parse(await welcome)).toEqual({ type: "welcome" });

    const echo = nextMessage();
    ws.send("ping");
    expect(await echo).toBe("echo:ping");
    expect(log).toEqual(["open", "message:ping"]);
  });

  it("releases held requests and frees the port when startup fails", async () => {
    const { early, base } = start();

    const pending = Bun.fetch(`${base}/api/v1/route`, { method: "POST", body: "{}" });
    expect(await settledWithin(pending, 100)).toBe("pending");

    early.fail(new Error("database is corrupt"));

    // The held request is released (either a 503 or a dropped connection), never left hanging.
    const outcome = await settledWithin(
      pending.then(
        (response) => response.status,
        () => "closed" as const,
      ),
      2000,
    );
    expect(outcome === 503 || outcome === "closed").toBe(true);

    // Nothing is listening anymore.
    await expect(Bun.fetch(`${base}/health`)).rejects.toThrow();
  });
});
