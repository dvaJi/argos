import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StoreCreationOptions, StoreFactory, StoreLike } from "@argos/backend-core";

/**
 * JSON-file-backed `StoreFactory` for non-Electron hosts. Each store `name`
 * maps to `<configDir>/<name>.json`. Implements the `StoreLike` interface that
 * `AcpConfHelper` (and other shared config helpers) consume.
 */
export function createJsonStoreFactory(configDir: string): StoreFactory {
  return <TStore>(options: StoreCreationOptions<TStore>) =>
    new JsonStore<Record<string, unknown>>(
      join(configDir, `${options.name}.json`),
      options.defaults as Record<string, unknown> | undefined,
    ) as StoreLike<TStore & Record<string, unknown>>;
}

class JsonStore<TStore extends Record<string, unknown>> implements StoreLike<TStore> {
  private data: TStore;

  constructor(
    private readonly filePath: string,
    defaults?: TStore,
  ) {
    this.data = this.load(defaults);
  }

  private load(defaults?: TStore): TStore {
    const base = (defaults ?? {}) as TStore;
    if (!existsSync(this.filePath)) {
      return { ...base };
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return { ...base, ...(JSON.parse(raw) as TStore) };
    } catch {
      return { ...base };
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  get<TValue = unknown>(key: string, defaultValue?: TValue): TValue | undefined {
    const value = (this.data as Record<string, unknown>)[key];
    return value === undefined ? defaultValue : (value as TValue);
  }

  set(keyOrValues: string | Record<string, unknown>, value?: unknown): void {
    if (typeof keyOrValues === "string") {
      (this.data as Record<string, unknown>)[keyOrValues] = value;
    } else {
      this.data = { ...this.data, ...(keyOrValues as TStore) };
    }
    this.persist();
  }

  delete(key: string): void {
    delete (this.data as Record<string, unknown>)[key];
    this.persist();
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  clear(): void {
    this.data = {} as TStore;
    this.persist();
  }

  get store(): TStore {
    return this.data;
  }

  get path(): string {
    return this.filePath;
  }
}
