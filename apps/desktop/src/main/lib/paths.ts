import { app } from "electron";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

let cachedPreloadDir: string | null = null;

export function getPreloadDir(): string {
  if (cachedPreloadDir !== null) return cachedPreloadDir;
  const appPath = app.getAppPath();
  const pkgRaw = readFileSync(join(appPath, "package.json"), "utf8");
  const mainField = JSON.parse(pkgRaw).main as string;
  const mainEntry = normalize(join(appPath, mainField));
  cachedPreloadDir = normalize(join(dirname(mainEntry), "..", "preload"));
  return cachedPreloadDir;
}

export function getPreloadPath(name: string): string {
  return normalize(join(getPreloadDir(), name));
}

export function __resetPreloadDirCacheForTests(): void {
  cachedPreloadDir = null;
}
