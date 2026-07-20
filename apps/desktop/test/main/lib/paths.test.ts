import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalize } from "node:path";

vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
}));

import { getPreloadPath, __resetPreloadDirCacheForTests } from "../../../src/main/lib/paths";
import { readFileSync } from "node:fs";
import { app } from "electron";

describe("getPreloadPath", () => {
  beforeEach(() => {
    __resetPreloadDirCacheForTests();
    vi.mocked(app.getAppPath).mockClear();
    vi.mocked(readFileSync).mockClear();
  });

  it("resolves to out/preload when main field points at apps/desktop (dev layout)", () => {
    vi.mocked(app.getAppPath).mockReturnValue("/mock/apps/desktop");
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith("package.json")) return JSON.stringify({ main: "./out/main/index.js" });
      throw new Error(`unexpected read: ${String(p)}`);
    });

    expect(getPreloadPath("index.mjs")).toBe(normalize("/mock/apps/desktop/out/preload/index.mjs"));
  });

  it("never resolves inside out/main/preload (the code-split bug path)", () => {
    vi.mocked(app.getAppPath).mockReturnValue("/mock/apps/desktop");
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith("package.json")) return JSON.stringify({ main: "./out/main/index.js" });
      throw new Error(`unexpected read: ${String(p)}`);
    });

    const result = getPreloadPath("index.mjs");
    expect(result).not.toMatch(/[\\/]main[\\/]preload/);
  });

  it("resolves under apps/desktop/out/preload when main field is rooted at the asar (packaged layout)", () => {
    vi.mocked(app.getAppPath).mockReturnValue("/mock/resources/app.asar");
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith("package.json")) {
        return JSON.stringify({ main: "./apps/desktop/out/main/index.js" });
      }
      throw new Error(`unexpected read: ${String(p)}`);
    });

    expect(getPreloadPath("pluginSettings.mjs")).toBe(
      normalize("/mock/resources/app.asar/apps/desktop/out/preload/pluginSettings.mjs"),
    );
  });

  it("memoizes the directory lookup across calls", () => {
    vi.mocked(app.getAppPath).mockReturnValue("/mock/apps/desktop");
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith("package.json")) return JSON.stringify({ main: "./out/main/index.js" });
      throw new Error(`unexpected read: ${String(p)}`);
    });

    getPreloadPath("index.mjs");
    getPreloadPath("floating.mjs");
    getPreloadPath("splash.mjs");

    expect(vi.mocked(readFileSync)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(app.getAppPath)).toHaveBeenCalledTimes(1);
  });
});
