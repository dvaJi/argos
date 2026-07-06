import fs from "node:fs";
import path from "node:path";
import { DuckDBConnection, DuckDBInstance, arrayValue } from "@duckdb/node-api";

import type { IMemoryVectorStore, MemoryVectorMatch, MemoryVectorQueryOptions, MemoryVectorRecord } from "./types";

interface EmbeddingIdentity {
  providerId: string;
  modelId: string;
}

/**
 * Resolve the directory containing bundled DuckDB extensions. Hosts inject this
 * via the `ARGOS_DUCKDB_EXTENSION_DIR` env var or `import.meta.dir` fallback.
 */
function resolveExtensionDir(): string {
  const envDir = process.env.ARGOS_DUCKDB_EXTENSION_DIR;
  if (envDir) return envDir;
  return path.join(process.cwd(), "runtime", "duckdb", "extensions");
}

export class MemoryVectorStore implements IMemoryVectorStore {
  private dbInstance!: DuckDBInstance;
  private connection!: DuckDBConnection;
  private readonly vectorTable = "memory_vector";
  private readonly metaTable = "embedding_meta";
  private usable = true;

  private constructor(
    private readonly dbPath: string,
    private readonly metric: "cosine" | "l2sq" | "ip",
  ) {}

  static async create(
    dbPath: string,
    dimensions: number,
    embedding: EmbeddingIdentity,
    metric: "cosine" | "l2sq" | "ip" = "cosine",
  ): Promise<MemoryVectorStore> {
    const parentDir = path.dirname(dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const store = new MemoryVectorStore(dbPath, metric);
    if (fs.existsSync(dbPath)) {
      await store.open(dimensions, embedding);
    } else {
      await store.initialize(dimensions, embedding);
    }
    return store;
  }

  isUsable(): boolean {
    return this.usable;
  }

  private async connect(): Promise<void> {
    this.dbInstance = await DuckDBInstance.create(this.dbPath);
    this.connection = await this.dbInstance.connect();
  }

  private async loadVss(): Promise<void> {
    const extensionPath = path.join(resolveExtensionDir(), "vss.duckdb_extension");
    if (fs.existsSync(extensionPath)) {
      const escapedPath = extensionPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
      await this.connection.run(`LOAD '${escapedPath}';`);
    } else {
      await this.connection.run("INSTALL vss;");
      await this.connection.run("LOAD vss;");
    }
    await this.connection.run("SET hnsw_enable_experimental_persistence = true;");
  }

  private async initialize(dimensions: number, embedding: EmbeddingIdentity): Promise<void> {
    await this.connect();
    await this.loadVss();
    await this.connection.run(
      `CREATE TABLE IF NOT EXISTS ${this.vectorTable} (
         memory_id VARCHAR PRIMARY KEY,
         embedding FLOAT[${dimensions}]
       );`,
    );
    await this.connection.run(
      `CREATE INDEX IF NOT EXISTS idx_${this.vectorTable}_emb
         ON ${this.vectorTable}
         USING HNSW (embedding)
         WITH (metric='${this.metric}', M=16, ef_construction=200);`,
    );
    await this.connection.run(
      `CREATE TABLE IF NOT EXISTS ${this.metaTable} (provider VARCHAR, model VARCHAR, dim INTEGER);`,
    );
    await this.connection.run(`INSERT INTO ${this.metaTable} (provider, model, dim) VALUES (?, ?, ?);`, [
      embedding.providerId,
      embedding.modelId,
      dimensions,
    ]);
  }

  private async open(expectedDim: number, embedding: EmbeddingIdentity): Promise<void> {
    await this.connect();
    await this.loadVss();

    const meta = await this.readEmbeddingMeta();
    if (!meta) {
      this.usable = false;
      return;
    }

    if (meta.provider !== embedding.providerId || meta.model !== embedding.modelId || meta.dim !== expectedDim) {
      this.usable = false;
    }
  }

  private async readEmbeddingMeta(): Promise<{
    provider: string;
    model: string;
    dim: number;
  } | null> {
    try {
      const reader = await this.connection.runAndReadAll(`SELECT provider, model, dim FROM ${this.metaTable} LIMIT 1;`);
      const row = reader.getRowObjectsJson()[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }
      return { provider: String(row.provider), model: String(row.model), dim: Number(row.dim) };
    } catch {
      return null;
    }
  }

  async upsert(records: MemoryVectorRecord[]): Promise<void> {
    if (!records.length) {
      return;
    }

    await this.connection.run("BEGIN TRANSACTION;");
    try {
      for (const record of records) {
        const vec = arrayValue(Array.from(record.embedding));
        await this.connection.run(`DELETE FROM ${this.vectorTable} WHERE memory_id = ?;`, [record.memoryId]);
        await this.connection.run(`INSERT INTO ${this.vectorTable} (memory_id, embedding) VALUES (?, ?::FLOAT[]);`, [
          record.memoryId,
          vec,
        ]);
      }
      await this.connection.run("COMMIT;");
    } catch (error) {
      await this.connection.run("ROLLBACK;").catch(() => undefined);
      throw error;
    }
  }

  async query(embedding: number[], options: MemoryVectorQueryOptions): Promise<MemoryVectorMatch[]> {
    const fn =
      this.metric === "ip"
        ? "array_negative_inner_product"
        : this.metric === "cosine"
          ? "array_cosine_distance"
          : "array_distance";

    const reader = await this.connection.runAndReadAll(
      `SELECT memory_id, ${fn}(embedding, ?) AS distance
       FROM ${this.vectorTable}
       ORDER BY distance
       LIMIT ?;`,
      [arrayValue(Array.from(embedding)), options.topK],
    );
    const rows = reader.getRowObjectsJson() as Array<Record<string, unknown>>;
    return rows.map((row) => ({ memoryId: String(row.memory_id), distance: Number(row.distance) }));
  }

  async deleteByMemoryIds(memoryIds: string[]): Promise<void> {
    if (!memoryIds.length) {
      return;
    }
    const placeholders = memoryIds.map(() => "?").join(", ");
    await this.connection.run(`DELETE FROM ${this.vectorTable} WHERE memory_id IN (${placeholders});`, memoryIds);
  }

  static destroyFile(dbPath: string): void {
    const failures: string[] = [];
    for (const file of [dbPath, `${dbPath}.wal`]) {
      try {
        fs.rmSync(file, { force: true });
      } catch (error) {
        failures.push(`${file}: ${String(error)}`);
      }
    }
    if (failures.length) {
      throw new Error(`[MemoryVectorStore] failed to delete ${failures.join("; ")}`);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.closeSync();
      }
      if (this.dbInstance) {
        this.dbInstance.closeSync();
      }
    } catch {
      // ignore close failures
    }
  }
}
