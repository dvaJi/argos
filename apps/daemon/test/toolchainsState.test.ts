import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { loadState, saveState, emptyState, toolchainsDir } from "../src/host/toolchains/state";

describe("toolchain state store", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const tempRoot = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-toolchains-"));
    roots.push(dir);
    return dir;
  };

  it("round-trips explicit sources", async () => {
    const dataDir = tempRoot();
    const state = emptyState();
    state.sources.node = { source: "custom", explicit: true, path: "D:/tools/node/node.exe" };
    state.sources.uv = { source: "unconfigured", explicit: true };
    await saveState(dataDir, state);

    const loaded = await loadState(dataDir);
    expect(loaded.sources.node).toEqual({ source: "custom", explicit: true, path: "D:/tools/node/node.exe" });
    expect(loaded.sources.uv).toEqual({ source: "unconfigured", explicit: true });
    expect(loaded.sources.ripgrep).toBeUndefined();
  });

  it("returns empty state when no file exists", async () => {
    const dataDir = tempRoot();
    const loaded = await loadState(dataDir);
    expect(loaded).toEqual({ version: 1, sources: {} });
  });

  it("quarantines corrupt state under a timestamped name and recovers", async () => {
    const dataDir = tempRoot();
    mkdirSync(toolchainsDir(dataDir), { recursive: true });
    await Bun.write(path.join(toolchainsDir(dataDir), "state.json"), "{ not json");

    const loaded = await loadState(dataDir);
    expect(loaded).toEqual({ version: 1, sources: {} });

    // The corrupt file is preserved beside the live one with a timestamp.
    const files = fs.readdirSync(toolchainsDir(dataDir));
    expect(files.some((file) => file.startsWith("state.corrupt-"))).toBe(true);
  });

  it("survives repeated corruption without throwing", async () => {
    const dataDir = tempRoot();
    mkdirSync(toolchainsDir(dataDir), { recursive: true });
    const statePath = path.join(toolchainsDir(dataDir), "state.json");

    await Bun.write(statePath, "garbage-one");
    expect(await loadState(dataDir)).toEqual({ version: 1, sources: {} });

    await Bun.write(statePath, "garbage-two");
    expect(await loadState(dataDir)).toEqual({ version: 1, sources: {} });

    const quarantined = fs.readdirSync(toolchainsDir(dataDir)).filter((file) => file.startsWith("state.corrupt-"));
    expect(quarantined.length).toBe(2);
  });

  it("drops malformed source entries instead of throwing", async () => {
    const dataDir = tempRoot();
    mkdirSync(toolchainsDir(dataDir), { recursive: true });
    await Bun.write(
      path.join(toolchainsDir(dataDir), "state.json"),
      JSON.stringify({
        version: 1,
        sources: {
          node: { source: "managed", explicit: true },
          uv: { source: "custom", explicit: true },
          ripgrep: "bogus",
        },
      }),
    );

    const loaded = await loadState(dataDir);
    expect(loaded.sources.node).toBeUndefined();
    expect(loaded.sources.uv).toBeUndefined();
    expect(loaded.sources.ripgrep).toBeUndefined();
    expect(existsSync(path.join(toolchainsDir(dataDir), "state.json"))).toBe(true);
  });
});
