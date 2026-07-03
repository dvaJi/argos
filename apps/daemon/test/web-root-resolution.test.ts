import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWebRoot } from "../src/lifecycle";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = join(tmpdir(), `argos-web-root-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function writeIndex(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html>");
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("resolveWebRoot", () => {
  it("uses an explicit web root when it contains index.html", () => {
    const tempRoot = makeTempRoot();
    const explicitRoot = join(tempRoot, "custom-web");
    writeIndex(explicitRoot);

    const result = resolveWebRoot({ explicitWebRoot: explicitRoot });

    expect(result.ok).toBe(true);
    expect(result.ok && result.root).toBe(resolve(explicitRoot));
  });

  it("discovers the local desktop web build from the repository root", () => {
    const tempRoot = makeTempRoot();
    const desktopWebRoot = join(tempRoot, "apps", "desktop", "out", "web");
    writeIndex(desktopWebRoot);

    const result = resolveWebRoot({
      cwd: tempRoot,
      executablePath: join(tempRoot, "apps", "daemon", "dist", "argos-daemon.exe"),
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.root).toBe(resolve(desktopWebRoot));
  });

  it("discovers a web directory next to the daemon executable", () => {
    const tempRoot = makeTempRoot();
    const executableDir = join(tempRoot, "dist");
    const executableWebRoot = join(executableDir, "web");
    writeIndex(executableWebRoot);

    const result = resolveWebRoot({
      cwd: tempRoot,
      executablePath: join(executableDir, "argos-daemon.exe"),
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.root).toBe(resolve(executableWebRoot));
  });

  it("returns an actionable error when no index.html is found", () => {
    const tempRoot = makeTempRoot();

    const result = resolveWebRoot({
      cwd: tempRoot,
      executablePath: join(tempRoot, "dist", "argos-daemon.exe"),
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("build:web");
    expect(!result.ok && result.searched.length).toBe(3);
  });
});
