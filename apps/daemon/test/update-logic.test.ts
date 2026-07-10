import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, detectAsset, runSelfUpdate } from "../src/update";
import { resolveDaemonVersion } from "../src/version";

// Resolved dev version now reads from package.json when __DAEMON_VERSION__ is not injected.
const CURRENT = resolveDaemonVersion();

function mockFetch(handler: (url: URL) => Response): void {
  globalThis.fetch = ((url) => Promise.resolve(handler(new URL(url.toString())))) as typeof fetch;
}

describe("checkForUpdate", () => {
  it("detects a newer release", async () => {
    mockFetch(() => new Response(JSON.stringify({ tag_name: "v9.9.9", html_url: "http://x/y" }), { status: 200 }));
    const result = await checkForUpdate("0.1.0");
    expect(result?.hasUpdate).toBe(true);
    expect(result?.latest).toBe("9.9.9");
  });

  it("returns null on network error", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch;
    expect(await checkForUpdate("0.1.0")).toBeNull();
  });
});

describe("runSelfUpdate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "argos-up-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes nothing when already current", async () => {
    mockFetch(() => new Response(JSON.stringify({ tag_name: `v${CURRENT}` }), { status: 200 }));
    await runSelfUpdate({ installDir: dir });
    expect(existsSync(join(dir, detectAsset().binary))).toBe(false);
  });

  it("writes the binary when the checksum matches", async () => {
    const body = "hello";
    const sha = createHash("sha256").update(body).digest("hex");
    mockFetch((url) => {
      if (url.pathname.endsWith("/releases/latest")) {
        return new Response(JSON.stringify({ tag_name: "v2.0.0", html_url: "http://x" }), { status: 200 });
      }
      if (url.pathname.endsWith(".sha256")) {
        return new Response(`${sha}  argos-daemon`, { status: 200 });
      }
      return new Response(body, { status: 200 });
    });
    await runSelfUpdate({ installDir: dir });
    expect(existsSync(join(dir, detectAsset().binary))).toBe(true);
  });

  it("aborts with exit 1 on checksum mismatch", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as never);
    mockFetch((url) => {
      if (url.pathname.endsWith("/releases/latest")) {
        return new Response(JSON.stringify({ tag_name: "v2.0.0", html_url: "http://x" }), { status: 200 });
      }
      if (url.pathname.endsWith(".sha256")) {
        return new Response("deadbeef".repeat(16), { status: 200 });
      }
      return new Response("hello", { status: 200 });
    });
    await expect(runSelfUpdate({ installDir: dir })).rejects.toThrow("exit:1");
    exitSpy.mockRestore();
  });
});
