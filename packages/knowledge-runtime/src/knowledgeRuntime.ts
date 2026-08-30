import fs from "node:fs";
import path from "node:path";

import type {
  BuiltinKnowledgeConfig,
  KnowledgeFileMessage,
  QueryResult,
  KnowledgeFileResult,
} from "@argos/shared/presenter";
import { getMetric } from "@argos/shared/vector";
import type { FileValidationResult } from "@argos/file-adapters/FileValidationService";
import { FileValidationService } from "@argos/file-adapters/FileValidationService";
import {
  RecursiveCharacterTextSplitter,
  type SupportedTextSplitterLanguage,
  SupportedTextSplitterLanguages,
} from "./textSplitters";
import { DuckDBKnowledgeDatabase } from "./duckdbKnowledgeDatabase";
import { KnowledgeStorePresenter, type KnowledgeStorePorts } from "./knowledgeStore";
import { KnowledgeTaskPresenter } from "./knowledgeTaskQueue";

/** Diff two knowledge config snapshots (moved from the desktop KnowledgeConfHelper). */
export function diffKnowledgeConfigs(
  oldConfigs: BuiltinKnowledgeConfig[],
  newConfigs: BuiltinKnowledgeConfig[],
): {
  added: BuiltinKnowledgeConfig[];
  deleted: BuiltinKnowledgeConfig[];
  updated: BuiltinKnowledgeConfig[];
} {
  const oldMap = new Map(oldConfigs.map((cfg) => [cfg.id, cfg]));
  const newMap = new Map(newConfigs.map((cfg) => [cfg.id, cfg]));

  const added = newConfigs.filter((cfg) => !oldMap.has(cfg.id));
  const deleted = oldConfigs.filter((cfg) => !newMap.has(cfg.id));
  const updated = newConfigs.filter(
    (cfg) => oldMap.has(cfg.id) && JSON.stringify(cfg) !== JSON.stringify(oldMap.get(cfg.id)),
  );

  return { added, deleted, updated };
}

export interface KnowledgeRuntimePorts extends KnowledgeStorePorts {
  /** DuckDB vss extension dir (optional; auto-resolved with network fallback). */
  extensionDir?: string;
  /** Max file size for ingestion (defaults to 30MB, like the desktop FilePresenter). */
  maxFileSize?: number;
}

/**
 * Host-agnostic built-in knowledge runtime (ported from the desktop
 * KnowledgePresenter). Owns per-config DuckDB stores, the ingestion task queue
 * and similarity queries. The host (daemon) supplies configs, embeddings and
 * event publishing through ports.
 */
export class KnowledgeRuntime {
  /**
   * Knowledge base storage directory
   */
  private readonly storageDir: string;

  private readonly getKnowledgeConfigs: () => BuiltinKnowledgeConfig[];

  /**
   * Global task scheduler
   */
  private readonly taskP: KnowledgeTaskPresenter;

  private readonly ports: KnowledgeRuntimePorts;

  private readonly fileValidationService: FileValidationService;

  /**
   * Cached RAG application instances
   */
  private readonly storePresenterCache: Map<string, KnowledgeStorePresenter>;
  private readonly storePresenterInitTasks: Map<string, Promise<KnowledgeStorePresenter>>;

  private knowledgeConfigSnapshot: BuiltinKnowledgeConfig[];

  constructor(deps: {
    storageDir: string;
    getKnowledgeConfigs: () => BuiltinKnowledgeConfig[];
    ports: KnowledgeRuntimePorts;
  }) {
    console.log("[RAG] Initializing built-in knowledge runtime");
    this.storageDir = deps.storageDir;
    this.getKnowledgeConfigs = deps.getKnowledgeConfigs;
    this.ports = deps.ports;
    this.taskP = new KnowledgeTaskPresenter();
    this.storePresenterCache = new Map();
    this.storePresenterInitTasks = new Map();
    this.fileValidationService = new FileValidationService();
    this.knowledgeConfigSnapshot = this.getKnowledgeConfigs() ?? [];

    this.initStorageDir();
  }

  /**
   * Initialize the knowledge base storage directory
   */
  private initStorageDir = (): void => {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  };

  /** Reconcile stores with the current config snapshot (create/update/delete). */
  syncConfigs = async (): Promise<void> => {
    const configs = this.getKnowledgeConfigs() ?? [];
    const diffs = diffKnowledgeConfigs(this.knowledgeConfigSnapshot, configs);
    this.knowledgeConfigSnapshot = configs;

    if (diffs.deleted.length > 0) {
      await Promise.all(diffs.deleted.map((config) => this.delete(config.id)));
    }

    if (diffs.added.length > 0) {
      diffs.added.forEach((config) => {
        console.log(`[RAG] New knowledge config added: ${config.id}`);
      });
    }

    if (diffs.updated.length > 0) {
      await Promise.all(
        diffs.updated.map((config) => {
          console.log(`[RAG] Knowledge config updated: ${config.id}`);
          return this.update(config);
        }),
      );
    }
  };

  /**
   * Supported operating systems
   */
  private static readonly SUPPORTED_OS = ["win32-x64", "linux-x64", "linux-arm64", "darwin-arm64", "darwin-x64"];

  isSupported = async (): Promise<boolean> => {
    const os = `${process.platform}-${process.arch}`;
    return KnowledgeRuntime.SUPPORTED_OS.includes(os);
  };

  /**
   * Create a knowledge base (initialize RAG application)
   * @param config Knowledge base configuration
   */
  create = async (config: BuiltinKnowledgeConfig): Promise<void> => {
    await this.createStorePresenter(config);
  };

  /**
   * Update a knowledge base configuration
   * @param config Knowledge base configuration
   */
  update = async (config: BuiltinKnowledgeConfig): Promise<void> => {
    if (config.enabled) {
      // If enabled and present in cache, update the configuration
      const rag = this.getStorePresenter(config.id);
      if (rag) {
        rag.updateConfig(config);
        return;
      }

      const initializingRag = await this.storePresenterInitTasks.get(config.id)?.catch(() => undefined);
      if (initializingRag) {
        initializingRag.updateConfig(config);
      }
    } else {
      // If disabled and present in cache, close the instance
      await this.closeStorePresenterIfExists(config.id);
    }
  };

  /**
   * Delete a knowledge base (remove local storage)
   * @param id Knowledge base ID
   */
  delete = async (id: string): Promise<void> => {
    try {
      const initializingRag = await this.storePresenterInitTasks.get(id)?.catch(() => undefined);
      this.storePresenterInitTasks.delete(id);
      const cachedRag = this.getStorePresenter(id);
      const rag = cachedRag ?? initializingRag;

      if (rag) {
        await rag.destroy();
        return;
      }

      const dbPath = path.join(this.storageDir, id);
      if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath, { recursive: true });
      }
      if (fs.existsSync(dbPath + ".wal")) {
        fs.rmSync(dbPath + ".wal", { recursive: true });
      }
    } finally {
      this.storePresenterCache.delete(id);
      this.storePresenterInitTasks.delete(id);
    }
  };

  /**
   * Create a RAG application instance
   * @param params BuiltinKnowledgeConfig
   * @returns KnowledgeStorePresenter
   */
  private createStorePresenter = async (config: BuiltinKnowledgeConfig): Promise<KnowledgeStorePresenter> => {
    const cachedRag = this.getStorePresenter(config.id);
    if (cachedRag) {
      cachedRag.updateConfig(config);
      return cachedRag;
    }

    const initializingRag = this.storePresenterInitTasks.get(config.id);
    if (initializingRag) {
      const rag = await initializingRag;
      rag.updateConfig(config);
      return rag;
    }

    const initTask = (async () => {
      const db = await this.getVectorDatabase(config.id, config.dimensions, config.normalized);
      try {
        const rag = new KnowledgeStorePresenter(db, config, this.taskP, this.ports);
        this.storePresenterCache.set(config.id, rag);
        return rag;
      } catch (e) {
        try {
          await db.close();
        } catch (closeError) {
          console.error("[RAG] Failed to close vector database after storePresenter error:", closeError);
        }
        throw e;
      }
    })();

    this.storePresenterInitTasks.set(config.id, initTask);

    try {
      return await initTask;
    } finally {
      if (this.storePresenterInitTasks.get(config.id) === initTask) {
        this.storePresenterInitTasks.delete(config.id);
      }
    }
  };

  /**
   * Get the knowledge base instance
   * @param id Knowledge base ID
   * @returns Knowledge base instance
   */
  private getStorePresenter = (id: string): KnowledgeStorePresenter | null => {
    if (this.storePresenterCache.has(id)) {
      return this.storePresenterCache.get(id) as KnowledgeStorePresenter;
    }
    return null;
  };

  /**
   * Get the RAG application instance
   * @param id Knowledge base ID
   */
  private getOrCreateStorePresenter = async (id: string): Promise<KnowledgeStorePresenter> => {
    // Return on cache hit
    if (this.storePresenterCache.has(id)) {
      return this.storePresenterCache.get(id) as KnowledgeStorePresenter;
    }
    // Get the configuration
    const configs = this.getKnowledgeConfigs();
    const config = configs.find((cfg) => cfg.id === id);
    if (!config) {
      throw new Error(`Knowledge config not found for id: ${id}`);
    }

    return await this.createStorePresenter(config);
  };

  /**
   * Close the RAG application instance
   * @param id Knowledge base ID
   * @returns void
   */
  private closeStorePresenterIfExists = async (id: string): Promise<void> => {
    const initializingRag = await this.storePresenterInitTasks.get(id)?.catch(() => undefined);
    const rag = this.getStorePresenter(id) ?? initializingRag;
    try {
      if (rag) {
        await rag.close();
      }
    } finally {
      this.storePresenterCache.delete(id);
    }
  };

  /**
   * Get the vector database instance
   * @param id Knowledge base ID
   * @param dimensions Vector dimensions
   * @returns
   */
  private getVectorDatabase = async (
    id: string,
    dimensions: number,
    normalized: boolean,
  ): Promise<DuckDBKnowledgeDatabase> => {
    const dbPath = path.join(this.storageDir, id);
    if (fs.existsSync(dbPath)) {
      const db = new DuckDBKnowledgeDatabase(dbPath, { extensionDir: this.ports.extensionDir });
      await db.open();
      return db;
    }
    // If the database does not exist, initialize it
    const db = new DuckDBKnowledgeDatabase(dbPath, { extensionDir: this.ports.extensionDir });
    await db.initialize(dimensions, {
      metric: getMetric(normalized),
    });
    return db;
  };

  async addFile(id: string, filePath: string): Promise<KnowledgeFileResult> {
    try {
      const rag = await this.getOrCreateStorePresenter(id);
      return await rag.addFile(filePath);
    } catch (err) {
      return {
        error: `Failed to add file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async deleteFile(id: string, fileId: string): Promise<void> {
    const rag = await this.getOrCreateStorePresenter(id);
    await rag.deleteFile(fileId);
  }

  async reAddFile(id: string, fileId: string): Promise<KnowledgeFileResult> {
    try {
      const rag = await this.getOrCreateStorePresenter(id);
      return await rag.reAddFile(fileId);
    } catch (err) {
      return {
        error: `Failed to re-add file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async queryFile(id: string, fileId: string): Promise<KnowledgeFileMessage | null> {
    const rag = await this.getOrCreateStorePresenter(id);
    return await rag.queryFile(fileId);
  }

  async listFiles(id: string): Promise<KnowledgeFileMessage[]> {
    const rag = await this.getOrCreateStorePresenter(id);
    return await rag.listFiles();
  }

  async closeAll(): Promise<void> {
    const initializingRags = await Promise.allSettled(this.storePresenterInitTasks.values());
    const stores = new Set<KnowledgeStorePresenter>(this.storePresenterCache.values());

    for (const result of initializingRags) {
      if (result.status === "fulfilled") {
        stores.add(result.value);
      }
    }

    await Promise.all(Array.from(stores).map((rag) => rag.close()));
    this.storePresenterCache.clear();
    this.storePresenterInitTasks.clear();
  }

  /**
   * Close every open DuckDB store and delete all persisted knowledge data
   * (stores re-create lazily from configs on next use). Used by the desktop
   * "reset knowledge data" flow via the `knowledge.reset` route — deleting the
   * files while the runtime holds connections would fail or leave the cache
   * pointing at removed files.
   */
  async resetAll(): Promise<void> {
    await this.closeAll();
    if (fs.existsSync(this.storageDir)) {
      for (const entry of fs.readdirSync(this.storageDir)) {
        fs.rmSync(path.join(this.storageDir, entry), { recursive: true, force: true });
      }
    }
    this.initStorageDir();
    this.knowledgeConfigSnapshot = this.getKnowledgeConfigs() ?? [];
  }

  async destroy(): Promise<void> {
    await this.closeAll();
  }

  async similarityQuery(id: string, key: string): Promise<QueryResult[]> {
    const rag = await this.getOrCreateStorePresenter(id);
    return await rag.similarityQuery(key);
  }

  /**
   * Get the knowledge base task queue status
   */
  async getTaskQueueStatus() {
    return this.taskP.getStatus();
  }

  async pauseAllRunningTasks(id: string): Promise<void> {
    const rag = await this.getOrCreateStorePresenter(id);
    await rag.pauseAllRunningTasks();
  }

  async resumeAllPausedTasks(id: string): Promise<void> {
    const rag = await this.getOrCreateStorePresenter(id);
    await rag.resumeAllPausedTasks();
  }

  separators: string[] = ["\n\n", "\n", " ", ""];

  async getSupportedLanguages(): Promise<string[]> {
    return [...SupportedTextSplitterLanguages];
  }

  async getSeparatorsForLanguage(language: string): Promise<string[]> {
    try {
      return RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language as SupportedTextSplitterLanguage);
    } catch {
      return this.separators;
    }
  }

  /**
   * Validates if a file is supported for knowledge base processing
   * @param filePath Path to the file to validate
   * @returns FileValidationResult with validation details
   */
  async validateFile(filePath: string): Promise<FileValidationResult> {
    try {
      return await this.fileValidationService.validateFile(filePath);
    } catch (error) {
      console.error("Error validating file for knowledge base:", error);
      return {
        isSupported: false,
        error: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        suggestedExtensions: this.fileValidationService.getSupportedExtensions(),
      };
    }
  }

  /**
   * Gets all supported file extensions for knowledge base processing
   * @returns Array of supported file extensions (without dots)
   */
  async getSupportedFileExtensions(): Promise<string[]> {
    try {
      const extensions = this.fileValidationService.getSupportedExtensions();
      return extensions;
    } catch (error) {
      console.error(`Error getting supported extensions: ${error instanceof Error ? error.message : "Unknown error"}`);

      // Return fallback extensions if service fails
      const fallbackExtensions = [
        "txt",
        "md",
        "markdown",
        "pdf",
        "docx",
        "pptx",
        "xlsx",
        "csv",
        "json",
        "yaml",
        "yml",
        "xml",
        "js",
        "ts",
        "py",
        "java",
        "cpp",
        "c",
        "h",
        "css",
        "html",
      ].sort();

      console.warn(`[RAG] Using fallback extensions: ${fallbackExtensions.join(", ")}`);
      return fallbackExtensions;
    }
  }
}
