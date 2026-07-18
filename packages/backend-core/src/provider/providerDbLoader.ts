import fs from "fs";
import path from "path";
import {
  type ProviderAggregate,
  type ProviderEntry,
  type ProviderModel,
  sanitizeAggregate,
} from "@argos/shared/types/model-db";
import { resolveProviderId } from "../config";

const DEFAULT_PROVIDER_DB_URL =
  "https://raw.githubusercontent.com/ThinkInAIXYZ/PublicProviderConf/refs/heads/dev/dist/all.json";

type MetaFile = {
  sourceUrl: string;
  etag?: string;
  lastUpdated: number;
  ttlHours: number;
  lastAttemptedAt?: number;
};

export type ProviderDbRefreshResult = {
  status: "updated" | "not-modified" | "skipped" | "error";
  lastUpdated: number | null;
  providersCount: number;
  message?: string;
};

export type ProviderDbLoaderOptions = {
  /** Directory used to store the cached catalog (providers.json + meta.json). */
  cacheDir: string;
  /** Optional path to a built-in catalog file used as fallback when the cache is empty. */
  builtInDbPath?: string;
  /** Override the remote catalog source URL. */
  sourceUrl?: string;
  /** Resolver that blocks automatic remote refresh (e.g. privacy mode). */
  privacyModeResolver?: () => boolean;
  onLoaded?: (info: { providersCount: number }) => void;
  onUpdated?: (info: { providersCount: number; lastUpdated: number }) => void;
};

export class ProviderDbLoader {
  private cache: ProviderAggregate | null = null;
  private cacheDir: string;
  private builtInDbPath?: string;
  private cacheFilePath: string;
  private metaFilePath: string;
  private sourceUrlOverride?: string;
  private privacyModeResolver: () => boolean = () => false;
  private onLoaded?: (info: { providersCount: number }) => void;
  private onUpdated?: (info: { providersCount: number; lastUpdated: number }) => void;
  private refreshPromise: Promise<ProviderDbRefreshResult> | null = null;

  constructor(options: ProviderDbLoaderOptions) {
    this.cacheDir = options.cacheDir;
    this.builtInDbPath = options.builtInDbPath;
    this.cacheFilePath = path.join(this.cacheDir, "providers.json");
    this.metaFilePath = path.join(this.cacheDir, "meta.json");
    this.sourceUrlOverride = options.sourceUrl;
    this.privacyModeResolver = options.privacyModeResolver ?? (() => false);
    this.onLoaded = options.onLoaded;
    this.onUpdated = options.onUpdated;

    try {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}
  }

  setPrivacyModeResolver(resolver?: () => boolean): void {
    this.privacyModeResolver = resolver ?? (() => false);
  }

  // Public: initialize on app start (non-blocking refresh)
  async initialize(): Promise<void> {
    // Load from cache or built-in
    this.cache = this.loadFromCache() ?? this.loadFromBuiltIn();
    if (this.cache) {
      try {
        const providersCount = Object.keys(this.cache.providers || {}).length;
        this.onLoaded?.({ providersCount });
      } catch {}
    }

    if (this.isAutomaticRefreshBlocked()) {
      return;
    }

    // Always refresh once in the background on startup to pick up upstream updates.
    void this.refreshIfNeeded(true, { automatic: true })
      .then((result) => {
        if (result.status === "error") {
          console.warn("[ProviderDbLoader] Startup refresh failed:", result.message);
        }
      })
      .catch((error) => {
        console.warn("[ProviderDbLoader] Startup refresh failed:", error);
      });
  }

  getDb(): ProviderAggregate | null {
    if (this.cache) return this.cache;
    // Lazy try again if not initialized yet
    this.cache = this.loadFromCache() ?? this.loadFromBuiltIn();
    return this.cache;
  }

  getProvider(providerId: string): ProviderEntry | undefined {
    const db = this.getDb();
    if (!db) return undefined;
    const resolvedId = resolveProviderId(providerId);
    return db.providers?.[resolvedId ?? providerId];
  }

  getModel(providerId: string, modelId: string): ProviderModel | undefined {
    const provider = this.getProvider(providerId);
    if (!provider) return undefined;
    return provider.models.find((m) => m.id === modelId);
  }

  getSourceUrl(): string {
    return this.readMeta()?.sourceUrl?.trim() || this.getProviderDbUrl();
  }

  getMetaInfo(): { sourceUrl: string; lastUpdated: number | null } {
    const meta = this.readMeta();
    return {
      sourceUrl: meta?.sourceUrl?.trim() || this.getProviderDbUrl(),
      lastUpdated: meta?.lastUpdated ?? null,
    };
  }

  private loadFromCache(): ProviderAggregate | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return null;
      const raw = fs.readFileSync(this.cacheFilePath, "utf-8");
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeAggregate(parsed);
      if (!sanitized) return null;
      return sanitized;
    } catch {
      return null;
    }
  }

  private loadFromBuiltIn(): ProviderAggregate | null {
    try {
      if (!this.builtInDbPath || !fs.existsSync(this.builtInDbPath)) return null;
      const raw = fs.readFileSync(this.builtInDbPath, "utf-8");
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeAggregate(parsed);
      return sanitized ?? null;
    } catch {
      return null;
    }
  }

  private readMeta(): MetaFile | null {
    try {
      if (!fs.existsSync(this.metaFilePath)) return null;
      const raw = fs.readFileSync(this.metaFilePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private writeMeta(meta: MetaFile): void {
    try {
      fs.writeFileSync(this.metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
    } catch {}
  }

  private writeCacheAtomically(db: ProviderAggregate): void {
    const tmp = this.cacheFilePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, this.cacheFilePath);
  }

  private now(): number {
    return Date.now();
  }

  private getTtlHours(): number {
    const env = process.env.PROVIDER_DB_TTL_HOURS;
    const v = env ? Number(env) : 4;
    return Number.isFinite(v) && v > 0 ? v : 4;
  }

  private getProviderDbUrl(): string {
    const override = this.sourceUrlOverride?.trim();
    if (typeof override === "string" && override.length > 0) return override;

    const env = process.env.PROVIDER_DB_URL ?? process.env.VITE_PROVIDER_DB_URL;
    const trimmed = typeof env === "string" ? env.trim() : "";
    if (trimmed.length > 0) return trimmed;

    return DEFAULT_PROVIDER_DB_URL;
  }

  async refreshIfNeeded(
    force = false,
    options: {
      automatic?: boolean;
    } = {},
  ): Promise<ProviderDbRefreshResult> {
    const meta = this.readMeta();
    if (options.automatic && this.isAutomaticRefreshBlocked()) {
      return this.createResult("skipped", meta);
    }

    if (this.refreshPromise) return this.refreshPromise;

    const ttlHours = this.getTtlHours();
    const url = this.getProviderDbUrl();

    const needFirstFetch = !meta || !fs.existsSync(this.cacheFilePath);
    const freshnessTimestamp = meta?.lastAttemptedAt ?? meta?.lastUpdated ?? 0;
    const expired = meta ? this.now() - freshnessTimestamp > ttlHours * 3600 * 1000 : true;

    if (!force && !needFirstFetch && !expired) {
      return this.createResult("skipped", meta);
    }

    this.refreshPromise = this.fetchAndUpdate(url, meta || undefined).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private isAutomaticRefreshBlocked(): boolean {
    try {
      return Boolean(this.privacyModeResolver());
    } catch {
      return false;
    }
  }

  private createResult(
    status: ProviderDbRefreshResult["status"],
    meta?: MetaFile | null,
    message?: string,
  ): ProviderDbRefreshResult {
    const db = this.getDb();
    const providersCount = Object.keys(db?.providers || {}).length;
    return {
      status,
      lastUpdated: meta?.lastUpdated ?? null,
      providersCount,
      ...(message ? { message } : {}),
    };
  }

  private createAttemptMeta(prevMeta: MetaFile | undefined, url: string, now: number): MetaFile | null {
    if (!prevMeta) return null;
    return {
      ...prevMeta,
      sourceUrl: url,
      ttlHours: this.getTtlHours(),
      lastAttemptedAt: now,
    };
  }

  private async fetchAndUpdate(url: string, prevMeta?: MetaFile): Promise<ProviderDbRefreshResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers: Record<string, string> = {};
      if (prevMeta?.etag) headers["If-None-Match"] = prevMeta.etag;

      const res = await fetch(url, { headers, signal: controller.signal });
      const now = this.now();

      if (res.status === 304 && prevMeta) {
        const meta: MetaFile = {
          ...prevMeta,
          sourceUrl: url,
          ttlHours: this.getTtlHours(),
          lastAttemptedAt: now,
        };
        this.writeMeta(meta);
        return this.createResult("not-modified", meta);
      }

      if (!res.ok) {
        const meta = this.createAttemptMeta(prevMeta, url, now);
        if (meta) this.writeMeta(meta);
        return this.createResult("error", meta, `Request failed with status ${res.status}`);
      }

      const text = await res.text();
      // Size guard (≈ 5MB)
      if (text.length > 5 * 1024 * 1024) {
        const meta = this.createAttemptMeta(prevMeta, url, now);
        if (meta) this.writeMeta(meta);
        return this.createResult("error", meta, "Provider DB payload exceeds size limit");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const meta = this.createAttemptMeta(prevMeta, url, now);
        if (meta) this.writeMeta(meta);
        return this.createResult("error", meta, "Provider DB payload is not valid JSON");
      }

      const sanitized = sanitizeAggregate(parsed);
      if (!sanitized) {
        const meta = this.createAttemptMeta(prevMeta, url, now);
        if (meta) this.writeMeta(meta);
        return this.createResult("error", meta, "Provider DB payload failed validation");
      }

      const etag = res.headers.get("etag") || undefined;
      const meta: MetaFile = {
        sourceUrl: url,
        etag,
        lastUpdated: now,
        ttlHours: this.getTtlHours(),
        lastAttemptedAt: now,
      };

      // Write cache atomically and update in-memory
      this.writeCacheAtomically(sanitized);
      this.writeMeta(meta);
      this.cache = sanitized;
      try {
        const providersCount = Object.keys(this.cache.providers || {}).length;
        this.onUpdated?.({ providersCount, lastUpdated: meta.lastUpdated });
      } catch {}
      return this.createResult("updated", meta);
    } catch (error) {
      const meta = this.createAttemptMeta(prevMeta, url, this.now());
      if (meta) this.writeMeta(meta);
      const message = error instanceof Error ? error.message : "Unknown provider DB refresh error";
      return this.createResult("error", meta, message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
