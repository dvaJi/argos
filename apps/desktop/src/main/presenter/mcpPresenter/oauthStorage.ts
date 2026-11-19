import { app } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OAUTH_STORE_FILE = "mcp-oauth.json";

let cache: Record<string, unknown> | null = null;

function filePath(): string {
  return join(app.getPath("userData"), OAUTH_STORE_FILE);
}

function load(): Record<string, unknown> {
  if (cache) return cache;
  const path = filePath();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(data: Record<string, unknown>): void {
  cache = data;
  const path = filePath();
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export function readJsonFile(key: string): unknown {
  return load()[key] ?? null;
}

export function writeJsonFile(key: string, value: unknown): void {
  const data = load();
  data[key] = value;
  persist(data);
}
