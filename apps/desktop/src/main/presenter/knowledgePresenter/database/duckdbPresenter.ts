/**
 * DuckDB Database Presenter
 */
import fs from "node:fs";
import path from "node:path";

import { DuckDBConnection, DuckDBInstance, arrayValue } from "@duckdb/node-api";
import {
  IndexOptions,
  VectorInsertOptions,
  QueryOptions,
  QueryResult,
  IVectorDatabasePresenter,
  KnowledgeFileMessage,
  KnowledgeChunkMessage,
  KnowledgeTaskStatus,
} from "@argos/shared/presenter";

import { nanoid } from "nanoid";
import { app } from "electron";

const runtimeBasePath = path.join(app.getAppPath(), "runtime").replace("app.asar", "app.asar.unpacked");
const extensionDir = path.join(runtimeBasePath, "duckdb", "extensions");
const extensionSuffix = ".duckdb_extension";

// Database version constant
const CURRENT_DB_VERSION = 1;
const DB_VERSION_KEY = "db_version";

// Migration interface definition
interface DatabaseMigration {
  version: number;
  description: string;
  up: (presenter: DuckDBPresenter) => Promise<void>;
  down?: (presenter: DuckDBPresenter) => Promise<void>;
}

// Database migration definitions
const MIGRATIONS: DatabaseMigration[] = [
  {
    version: 1,
    description: "Initial database schema",
    up: async (_presenter: DuckDBPresenter) => {
      // The initial version migration is already handled in the initialize method
      console.log("[DuckDB Migration] Applied initial schema (v1)");
    },
  },
  // Example future migration:
  // {
  //   version: 2,
  //   description: 'Add file size and hash columns',
  //   up: async (presenter: DuckDBPresenter) => {
  //     await presenter.safeRun('ALTER TABLE file ADD COLUMN file_size BIGINT;')
  //     await presenter.safeRun('ALTER TABLE file ADD COLUMN file_hash VARCHAR;')
  //     await presenter.safeRun('CREATE INDEX IF NOT EXISTS idx_file_hash ON file (file_hash);')
  //   },
  //   down: async (presenter: DuckDBPresenter) => {
  //     await presenter.safeRun('ALTER TABLE file DROP COLUMN file_size;')
  //     await presenter.safeRun('ALTER TABLE file DROP COLUMN file_hash;')
  //   }
  // }
];

export class DuckDBPresenter implements IVectorDatabasePresenter {
  private dbInstance!: DuckDBInstance;
  private connection!: DuckDBConnection;

  private readonly dbPath: string;

  private readonly vectorTable = "vector";
  private readonly fileTable = "file";
  private readonly chunkTable = "chunk";
  private readonly metadataTable = "metadata";

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(dimensions: number, opts?: IndexOptions): Promise<void> {
    try {
      console.log(`[DuckDB] Initializing DuckDB database at ${this.dbPath}`);
      if (fs.existsSync(this.dbPath)) {
        console.error(`[DuckDB] Database ${this.dbPath} already exists`);
        throw new Error("Database already exists, cannot initialize again.");
      }
      console.log(`[DuckDB] connect to db`);
      await this.create();
      console.log(`[DuckDB] load vss extension`);
      await this.installAndLoadExtension("vss", async () => {
        await this.safeRun(`SET hnsw_enable_experimental_persistence = true;`);
      });
      console.log(`[DuckDB] create metadata table`);
      await this.initMetadataTable();
      console.log(`[DuckDB] create file table`);
      await this.initFileTable();
      console.log(`[DuckDB] create chunk table`);
      await this.initChunkTable();
      console.log(`[DuckDB] create vector table`);
      await this.initVectorTable(dimensions);
      console.log(`[DuckDB] create vector index`);
      await this.initTableIndex(opts);
      console.log(`[DuckDB] set initial database version`);
      await this.setDatabaseVersion(CURRENT_DB_VERSION);
    } catch (error) {
      console.error("[DuckDB] initialization failed:", error);
      this.close();
    }
  }

  async open(): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      console.error(`[DuckDB] Database ${this.dbPath} does not exist`);
      throw new Error("Database does not exist, please initialize first.");
    }

    if (await this.hasWal()) {
      try {
        await this.repairIndex();
      } catch (error) {
        // TODO: database is unrecoverable, prompt user to rebuild
        console.error("[DuckDB] Error opening database:", error);
        throw new Error("Failed to open database, please check the logs for details.");
      }
    }

    // Clear any leftover transaction queue
    if (this.transactionQueue.length > 0) {
      this.transactionQueue = [];
    }

    console.log(`[DuckDB] connect to db`);
    await this.connect();
    console.log(`[DuckDB] load vss extension`);
    await this.installAndLoadExtension("vss", async () => {
      await this.safeRun(`SET hnsw_enable_experimental_persistence = true;`);
    });
    console.log(`[DuckDB] check and run database migrations`);
    await this.runMigrations();
    console.log(`[DuckDB] clear dirty data`);
    await this.clearDirtyData();
    console.log(`[DuckDB] paused all running tasks`);
    await this.pauseAllRunningTasks();
  }

  async close(): Promise<void> {
    try {
      // Wait for the current transaction to finish processing
      if (this.isProcessingTransaction && this.currentTransactionPromise) {
        try {
          await this.currentTransactionPromise;
        } catch (error) {
          console.warn("[DuckDB] Error waiting for transaction to complete during close:", error);
        }
      }

      // Clear any remaining transaction queue
      if (this.transactionQueue.length > 0) {
        const remainingOperations = [...this.transactionQueue];
        this.transactionQueue = [];
        const error = new Error("Database is closing, operations cancelled");
        for (const { reject } of remainingOperations) {
          reject(error);
        }
      }

      // CLOSE does not need an explicit CHECKPOINT, since DuckDB handles WAL files automatically
      // await this.safeRun('CHECKPOINT;')

      if (this.connection) {
        this.connection.closeSync();
      }
      if (this.dbInstance) {
        this.dbInstance.closeSync();
      }
      console.log("[DuckDB] DuckDB connection closed");
    } catch (err) {
      console.error("[DuckDB] close error", err);
    }
  }

  async destroy(): Promise<void> {
    await this.close();
    // Delete the database file
    try {
      if (fs.existsSync(this.dbPath)) {
        fs.rmSync(this.dbPath, { recursive: true });
      }
      if (fs.existsSync(this.dbPath + ".wal")) {
        fs.rmSync(this.dbPath + ".wal", { recursive: true });
      }
      console.log(`[DuckDB] Database at ${this.dbPath} destroyed.`);
    } catch (err) {
      console.error(`[DuckDB] Error destroying database at ${this.dbPath}:`, err);
    }
  }

  // ==================== IVectorDatabasePresenter interface implementation ====================

  async insertFile(file: KnowledgeFileMessage): Promise<void> {
    const sql = `
        INSERT INTO ${this.fileTable} (id, name, path, mime_type, status, uploaded_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `;
    await this.executeInTransaction(async () => {
      await this.safeRun(sql, [
        file.id,
        file.name,
        file.path,
        file.mimeType,
        file.status,
        String(file.uploadedAt),
        JSON.stringify(file.metadata),
      ]);
    });
  }

  async updateFile(file: KnowledgeFileMessage): Promise<void> {
    const sql = `
        UPDATE ${this.fileTable}
        SET name = ?, path = ?, mime_type = ?, status = ?, uploaded_at = ?, metadata = ?
        WHERE id = ?;
      `;
    await this.executeInTransaction(async () => {
      await this.safeRun(sql, [
        file.name,
        file.path,
        file.mimeType,
        file.status,
        String(file.uploadedAt),
        JSON.stringify(file.metadata),
        file.id,
      ]);
    });
  }

  async queryFile(id: string): Promise<KnowledgeFileMessage | null> {
    const sql = `SELECT * FROM ${this.fileTable} WHERE id = ?;`;
    try {
      const reader = await this.connection.runAndReadAll(sql, [id]);
      const rows = reader.getRowObjectsJson();
      if (rows.length === 0) return null;
      const row = rows[0];
      return this.toKnowledgeFileMessage(row);
    } catch (err) {
      console.error("[DuckDB] queryFile error", sql, id, err);
      throw err;
    }
  }

  async queryFiles(where: Partial<KnowledgeFileMessage>): Promise<KnowledgeFileMessage[]> {
    const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

    const entries = Object.entries(where).filter(([, value]) => value !== undefined);

    let sql = `SELECT * FROM ${this.fileTable}`;
    const params: any[] = [];

    if (entries.length > 0) {
      const conditions = entries.map(([key]) => `${camelToSnake(key)} = ?`).join(" AND ");
      sql += ` WHERE ${conditions}`;
      params.push(...entries.map(([, value]) => value));
    }

    sql += ` ORDER BY uploaded_at DESC;`;

    try {
      const reader = await this.connection.runAndReadAll(sql, params);
      const rows = reader.getRowObjectsJson();
      return rows.map((row) => this.toKnowledgeFileMessage(row));
    } catch (err) {
      console.error("[DuckDB] queryFiles error", sql, params, err);
      throw err;
    }
  }

  async listFiles(): Promise<KnowledgeFileMessage[]> {
    const sql = `SELECT * FROM ${this.fileTable} ORDER BY uploaded_at DESC;`;
    try {
      const reader = await this.connection.runAndReadAll(sql);
      const rows = reader.getRowObjectsJson();
      return rows.map((row) => this.toKnowledgeFileMessage(row));
    } catch (err) {
      console.error("[DuckDB] listFiles error", sql, err);
      throw err;
    }
  }

  async deleteFile(id: string): Promise<void> {
    await this.executeInTransaction(async () => {
      await this.safeRun(`DELETE FROM ${this.chunkTable} WHERE file_id = ?;`, [id]);
      await this.safeRun(`DELETE FROM ${this.vectorTable} WHERE file_id = ?;`, [id]);
      await this.safeRun(`DELETE FROM ${this.fileTable} WHERE id = ?;`, [id]);
    });
  }

  async insertChunks(chunks: KnowledgeChunkMessage[]): Promise<void> {
    if (!chunks.length) return;
    const valuesSql = chunks.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const sql = `INSERT INTO ${this.chunkTable} (id, file_id, chunk_index, content, status, error) VALUES ${valuesSql};`;
    const params: any[] = [];
    for (const chunk of chunks) {
      params.push(chunk.id, chunk.fileId, chunk.chunkIndex, chunk.content, chunk.status, chunk.error ?? "");
    }
    await this.executeInTransaction(async () => {
      await this.safeRun(sql, params);
    });
  }

  async updateChunkStatus(chunkId: string, status: KnowledgeTaskStatus, error?: string): Promise<void> {
    await this.executeInTransaction(async () => {
      await this.safeRun(`UPDATE ${this.chunkTable} SET status = ?, error = ? WHERE id = ?;`, [
        status,
        error ?? "",
        chunkId,
      ]);
    });
  }

  async queryChunks(where: Partial<KnowledgeChunkMessage>): Promise<KnowledgeChunkMessage[]> {
    const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

    const entries = Object.entries(where).filter(([, value]) => value !== undefined);

    let sql = `SELECT * FROM ${this.chunkTable}`;
    const params: any[] = [];

    if (entries.length > 0) {
      const conditions = entries.map(([key]) => `${camelToSnake(key)} = ?`).join(" AND ");
      sql += ` WHERE ${conditions}`;
      params.push(...entries.map(([, value]) => value));
    }

    try {
      const reader = await this.connection.runAndReadAll(sql, params);
      const rows = reader.getRowObjectsJson();
      return rows.map((row) => this.toKnowledgeChunkMessage(row));
    } catch (err) {
      console.error("[DuckDB] queryChunks error", sql, params, err);
      throw err;
    }
  }

  async deleteChunksByFile(fileId: string): Promise<void> {
    await this.executeInTransaction(async () => {
      await this.safeRun(`DELETE FROM ${this.chunkTable} WHERE file_id = ?;`, [fileId]);
    });
  }

  async insertVector(opts: VectorInsertOptions): Promise<void> {
    // Check whether the file exists
    const file = await this.queryFile(opts.fileId);
    if (!file) {
      throw new Error(`File with ID ${opts.fileId} does not exist`);
    }
    const vec = arrayValue(Array.from(opts.vector));
    await this.executeInTransaction(async () => {
      await this.safeRun(
        `INSERT INTO ${this.vectorTable} (id, embedding, file_id, chunk_id)
         VALUES (?, ?::FLOAT[], ?, ?);`,
        [nanoid(), vec, opts.fileId, opts.chunkId],
      );
    });
  }

  async insertVectors(records: VectorInsertOptions[]): Promise<void> {
    if (!records.length) return;
    // Build the batch insert SQL
    const valuesSql = records.map(() => "(?, ?::FLOAT[], ?, ?)").join(", ");
    const sql = `INSERT INTO ${this.vectorTable} (id, embedding, file_id, chunk_id) VALUES ${valuesSql};`;
    const params: any[] = [];
    for (const r of records) {
      params.push(nanoid());
      params.push(arrayValue(Array.from(r.vector)));
      params.push(r.fileId);
      params.push(r.chunkId);
    }
    await this.executeInTransaction(async () => {
      await this.safeRun(sql, params);
    });
  }

  async similarityQuery(vector: number[], options: QueryOptions): Promise<QueryResult[]> {
    const k = options.topK;
    const fn =
      options.metric === "ip"
        ? "array_negative_inner_product"
        : options.metric === "cosine"
          ? "array_cosine_distance"
          : "array_distance";
    const sql = `
      SELECT t.id as id, ${fn}(embedding, ?) AS distance, t1.content as content, t2.name as name, t2.path as path
      FROM ${this.vectorTable} t
      LEFT JOIN ${this.chunkTable} t1 ON t1.id = t.chunk_id
      LEFT JOIN ${this.fileTable} t2 ON t2.id = t.file_id
      ORDER BY distance
      LIMIT ?;
    `;
    const embParam = arrayValue(Array.from(vector));
    const paramsArr: any[] = [embParam];
    if (options.threshold != null) {
      paramsArr.push(options.threshold);
    }
    paramsArr.push(k);
    try {
      const reader = await this.connection.runAndReadAll(sql, paramsArr);
      const rows = reader.getRowObjectsJson();
      return rows.map((r: any) => ({
        id: r.id,
        distance: r.distance,
        metadata: {
          from: r.name,
          filePath: r.path,
          content: r.content,
        },
      }));
    } catch (err) {
      console.error("[DuckDB] similarityQuery error", sql, paramsArr, err);
      throw err;
    }
  }

  async deleteVectorsByFile(fileId: string): Promise<void> {
    await this.executeInTransaction(async () => {
      await this.safeRun(`DELETE FROM ${this.vectorTable} WHERE file_id = ?;`, [fileId]);
    });
  }

  // ==================== Conversion utilities ====================

  private toKnowledgeFileMessage(o: any): KnowledgeFileMessage {
    return {
      id: o.id,
      name: o.name,
      path: o.path,
      mimeType: o.mime_type,
      status: o.status,
      uploadedAt: Number(o.uploaded_at),
      metadata: typeof o.metadata === "string" ? JSON.parse(o.metadata) : o.metadata,
    };
  }

  private toKnowledgeChunkMessage(o: any): KnowledgeChunkMessage {
    return {
      id: o.id,
      fileId: o.file_id,
      chunkIndex: o.chunk_index,
      content: o.content,
      status: o.status,
      error: o.error,
    };
  }

  // ==================== Transaction management ====================
  private transactionQueue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timestamp: number; // Timestamp added for timeout detection
  }> = [];

  private isProcessingTransaction = false;
  private currentTransactionPromise: Promise<void> | null = null;
  private readonly TRANSACTION_TIMEOUT = 30000; // 30s timeout

  /**
   * Enqueue an operation in the transaction queue to ensure all database operations execute serially
   */
  private async executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.transactionQueue.push({
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // If no transaction is currently being processed, start processing the queue
      if (!this.isProcessingTransaction) {
        this.processTransactionQueue();
      }
    });
  }

  /**
   * Process the transaction queue, ensuring all operations execute serially
   */
  private async processTransactionQueue(): Promise<void> {
    if (this.isProcessingTransaction || this.transactionQueue.length === 0) {
      return;
    }

    this.isProcessingTransaction = true;

    // Create the current transaction Promise for the close method to await
    this.currentTransactionPromise = (async () => {
      try {
        // Begin transaction
        await this.safeRun("BEGIN TRANSACTION;");

        // Process all operations in the queue
        const operations = [...this.transactionQueue];
        this.transactionQueue = [];

        // Check whether any operations timed out
        const now = Date.now();
        const timeoutOps = operations.filter((op) => now - op.timestamp > this.TRANSACTION_TIMEOUT);

        if (timeoutOps.length > 0) {
          console.warn(`[DuckDB] Found ${timeoutOps.length} timeout operations, rejecting them`);
          const timeoutError = new Error("Transaction operation timeout");
          for (const { reject } of timeoutOps) {
            reject(timeoutError);
          }
        }

        // Only process operations that have not timed out
        const validOperations = operations.filter((op) => now - op.timestamp <= this.TRANSACTION_TIMEOUT);

        if (validOperations.length === 0) {
          return; // No valid operations to process
        }

        const results: any[] = [];
        let hasError = false;
        let errorToThrow: any = null;

        for (const { operation, resolve, reject } of validOperations) {
          try {
            const result = await operation();
            results.push({ success: true, result, resolve, reject });
          } catch (error) {
            results.push({ success: false, error, resolve, reject });
            hasError = true;
            if (!errorToThrow) {
              errorToThrow = error;
            }
          }
        }

        if (hasError) {
          // On error, roll back the transaction
          await this.safeRun("ROLLBACK;");

          // Reject all operations
          for (const { success, error, reject } of results) {
            if (success) {
              reject(errorToThrow); // Even successful operations fail due to the rollback
            } else {
              reject(error);
            }
          }
        } else {
          // If no error, commit the transaction
          await this.safeRun("COMMIT;");

          // Resolve all operations
          for (const { result, resolve } of results) {
            resolve(result);
          }
        }
      } catch (error) {
        // Handle errors from the transaction operation itself
        console.error("[DuckDB] Transaction processing error:", error);

        try {
          await this.safeRun("ROLLBACK;");
        } catch (rollbackError) {
          console.error("[DuckDB] Rollback error:", rollbackError);
        }

        // Reject all queued operations
        for (const { reject } of this.transactionQueue) {
          reject(error);
        }
        this.transactionQueue = [];
      } finally {
        this.isProcessingTransaction = false;
        this.currentTransactionPromise = null;

        // If new operations remain in the queue, continue processing
        if (this.transactionQueue.length > 0) {
          // Use setImmediate to avoid deep recursion of the call stack
          setImmediate(() => this.processTransactionQueue());
        }
      }
    })();

    await this.currentTransactionPromise;
  }

  private async safeRun(sql: string, params?: any[]): Promise<any> {
    try {
      if (!this.connection) await this.create();
      if (params) {
        return await this.connection.run(sql, params);
      } else {
        return await this.connection.run(sql);
      }
    } catch (err) {
      console.error("[DuckDB] sql error", sql, params, err);
      throw err;
    }
  }

  async pauseAllRunningTasks(): Promise<void> {
    // paused chunk
    await this.executeInTransaction(async () => {
      await this.safeRun(`UPDATE ${this.chunkTable} SET status = 'paused' WHERE status = 'processing';`);
    });
    // paused file
    await this.executeInTransaction(async () => {
      await this.safeRun(`UPDATE ${this.fileTable} SET status = 'paused' WHERE status = 'processing';`);
    });
  }

  async resumeAllPausedTasks(): Promise<void> {
    // resumed chunk
    await this.executeInTransaction(async () => {
      await this.safeRun(`UPDATE ${this.chunkTable} SET status = 'processing' WHERE status = 'paused';`);
    });
    // resumed file
    await this.executeInTransaction(async () => {
      await this.safeRun(`UPDATE ${this.fileTable} SET status = 'processing' WHERE status = 'paused';`);
    });
  }

  // ==================== Initialization ====================

  private async create() {
    this.dbInstance = await DuckDBInstance.create(this.dbPath);
    this.connection = await this.dbInstance.connect();
    console.log(`[DuckDB] Connected to DuckDB at ${this.dbPath}`);
  }

  private async connect() {
    this.dbInstance = await DuckDBInstance.create(this.dbPath);
    this.connection = await this.dbInstance.connect();
    console.log(`[DuckDB] Connected to DuckDB at ${this.dbPath}`);
  }

  /**
   * Attach the DuckDB database via memory and repair the index
   *
   * - Normal connection close auto-checkpoints, but abnormal shutdowns (crash, kill) cannot trigger it
   * - Connecting auto-checkpoints when a wal file exists, but the vss extension makes the auto-checkpoint fail and prevents the connection
   * - Must first install and load the vss extension in memory, attach to the local database, then run checkpoint
   */
  private async repairIndex(): Promise<void> {
    const ins = await DuckDBInstance.create(":memory:");
    const conn = await ins.connect();

    // load vss
    const extensionPath = path.join(extensionDir, `vss${extensionSuffix}`);
    if (fs.existsSync(extensionPath)) {
      const escapedPath = extensionPath.replace(/\\/g, "\\\\");
      console.log(`[DuckDB] LOAD VSS extension from ${escapedPath}`);
      await conn.run(`LOAD '${escapedPath}';`);
    } else {
      console.log("[DuckDB] LOAD VSS extension online");
      await conn.run(`INSTALL vss;`);
      await conn.run(`LOAD vss;`);
    }
    await conn.run(`SET hnsw_enable_experimental_persistence = true;`);

    // attach to the existing database
    await conn.run(`ATTACH DATABASE '${this.dbPath}' AS db;`);
    // await conn.run(`CHECKPOINT;`)

    // close
    conn.closeSync();
    ins.closeSync();
  }

  /** Install and load the VSS extension */
  private async installAndLoadExtension(name: string, afterRun?: () => Promise<void>): Promise<void> {
    const extensionPath = path.join(extensionDir, `${name}${extensionSuffix}`);
    if (fs.existsSync(extensionPath)) {
      const escapedPath = extensionPath.replace(/\\/g, "\\\\");
      console.log(`[DuckDB] LOAD ${name} extension from ${escapedPath}`);
      await this.safeRun(`LOAD '${escapedPath}';`);
    } else {
      console.log(`[DuckDB] LOAD ${name} extension online`);
      await this.safeRun(`INSTALL ${name};`);
      await this.safeRun(`LOAD ${name};`);
    }
    if (afterRun instanceof Function) await afterRun();
  }

  /** Create file metadata table */
  private async initFileTable(): Promise<void> {
    await this.safeRun(
      `CREATE TABLE IF NOT EXISTS ${this.fileTable} (
        id VARCHAR PRIMARY KEY,
        name VARCHAR,
        path VARCHAR,
        mime_type VARCHAR,
        status VARCHAR,
        uploaded_at BIGINT,
        metadata JSON
      );`,
    );
  }

  /** Create the chunks table */
  private async initChunkTable(): Promise<void> {
    await this.safeRun(
      `CREATE TABLE IF NOT EXISTS ${this.chunkTable} (
        id VARCHAR PRIMARY KEY,
        file_id VARCHAR,
        content TEXT,
        status VARCHAR,
        chunk_index INTEGER,
        error VARCHAR
      );`,
    );
  }

  /** Create the fixed-length vector table */
  private async initVectorTable(dimensions: number): Promise<void> {
    await this.safeRun(
      `CREATE TABLE IF NOT EXISTS ${this.vectorTable} (
         id VARCHAR PRIMARY KEY,
         embedding FLOAT[${dimensions}],
         file_id VARCHAR,
         chunk_id VARCHAR
       );`,
    );
  }

  /** Create indexes */
  private async initTableIndex(opts?: IndexOptions): Promise<void> {
    // file
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.fileTable}_file_id ON ${this.fileTable} (id);`);
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.fileTable}_file_status ON ${this.fileTable} (status);`);
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.fileTable}_file_path ON ${this.fileTable} (path);`);
    // chunk
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.chunkTable}_chunk_id ON ${this.chunkTable} (id);`);
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.chunkTable}_file_id ON ${this.chunkTable} (file_id);`);
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.chunkTable}_status ON ${this.chunkTable} (status);`);
    // vector
    const metric = opts?.metric || "cosine"; // Supports 'l2sq' | 'cosine' | 'ip'
    const M = opts?.M || 16;
    const efConstruction = opts?.efConstruction || 200;
    const sql = `CREATE INDEX IF NOT EXISTS idx_${this.vectorTable}_emb
     ON ${this.vectorTable}
     USING HNSW (embedding)
     WITH (
       metric='${metric}',
       M=${M},
       ef_construction=${efConstruction}
     );`;
    await this.safeRun(sql);
    await this.safeRun(`CREATE INDEX IF NOT EXISTS idx_${this.vectorTable}_file_id ON ${this.vectorTable} (file_id);`);
    await this.safeRun(
      `CREATE INDEX IF NOT EXISTS idx_${this.vectorTable}_chunk_id ON ${this.vectorTable} (chunk_id);`,
    );
  }

  /**
   * Clean up dirty data introduced by abnormal tasks
   */
  private async clearDirtyData(): Promise<void> {
    // Clean up vectors in the vector table that have no corresponding file
    await this.safeRun(`
      DELETE FROM ${this.vectorTable}
      WHERE file_id NOT IN (SELECT id FROM ${this.fileTable});
    `);

    // Clean up chunks in the chunks table that have no corresponding file
    await this.safeRun(`
      DELETE FROM ${this.chunkTable}
      WHERE file_id NOT IN (SELECT id FROM ${this.fileTable});
    `);
  }

  /**
   * Check whether a WAL file exists
   * @returns Whether a WAL file exists
   */
  private async hasWal(): Promise<boolean> {
    const walPath = this.dbPath + ".wal";
    return fs.existsSync(walPath);
  }

  // ==================== Database version control and migration ====================

  /**
   * Initialize the metadata table
   */
  private async initMetadataTable(): Promise<void> {
    await this.safeRun(
      `CREATE TABLE IF NOT EXISTS ${this.metadataTable} (
        key VARCHAR PRIMARY KEY,
        value VARCHAR
      );`,
    );
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    // Ensure the metadata table exists
    await this.initMetadataTable();

    const currentVersion = await this.getDatabaseVersion();
    console.log(`[DuckDB] Current database version: ${currentVersion}`);
    console.log(`[DuckDB] Target database version: ${CURRENT_DB_VERSION}`);

    if (currentVersion === CURRENT_DB_VERSION) {
      console.log("[DuckDB] Database is up to date, no migrations needed");
      return;
    }

    if (currentVersion > CURRENT_DB_VERSION) {
      console.warn(
        `[DuckDB] Database version (${currentVersion}) is newer than supported version (${CURRENT_DB_VERSION})`,
      );
      return;
    }

    // Run all migrations from the current version to the target version
    const migrationsToRun = MIGRATIONS.filter((m) => m.version > currentVersion && m.version <= CURRENT_DB_VERSION);

    if (migrationsToRun.length === 0) {
      console.log("[DuckDB] No migrations found to run");
      return;
    }

    console.log(`[DuckDB] Running ${migrationsToRun.length} migrations...`);

    // Execute migrations sorted by version number
    migrationsToRun.sort((a, b) => a.version - b.version);

    for (const migration of migrationsToRun) {
      console.log(`[DuckDB] Running migration v${migration.version}: ${migration.description}`);

      try {
        await this.executeInTransaction(async () => {
          await migration.up(this);
        });
        await this.setDatabaseVersion(migration.version);

        console.log(`[DuckDB] Migration v${migration.version} completed successfully`);
      } catch (error) {
        console.error(`[DuckDB] Migration v${migration.version} failed:`, error);
        throw new Error(`Database migration v${migration.version} failed: ${error}`);
      }
    }

    console.log(`[DuckDB] All migrations completed successfully. Database updated to version ${CURRENT_DB_VERSION}`);
  }

  /**
   * Get database metadata info
   */
  async getDatabaseMetadata(): Promise<Record<string, any>> {
    try {
      const sql = `SELECT key, value FROM ${this.metadataTable};`;
      const reader = await this.connection.runAndReadAll(sql);
      const rows = reader.getRowObjectsJson();

      const metadata: Record<string, any> = {};
      for (const row of rows) {
        const key = typeof row.key === "string" ? row.key : String(row.key);
        metadata[key] = row.value;
      }
      return metadata;
    } catch (error) {
      console.error("[DuckDB] Error getting database metadata:", error);
      return {};
    }
  }

  /**
   * Set database metadata
   */
  async setDatabaseMetadata(key: string, value: string): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO ${this.metadataTable} (key, value)
      VALUES (?, ?);
    `;
    await this.executeInTransaction(async () => {
      await this.safeRun(sql, [key, value]);
    });
  }
  /**
   * Get the database version
   */
  private async getDatabaseVersion(): Promise<number> {
    try {
      const metadata = await this.getDatabaseMetadata();
      const version = metadata[DB_VERSION_KEY];
      return version ? parseInt(typeof version === "string" ? version : String(version), 10) : 0;
    } catch (error) {
      // If the metadata table does not exist, this is an older database version
      console.warn("[DuckDB] Cannot get database version, assuming version 0:", error);
      return 0;
    }
  }

  /**
   * Set the database version
   */
  private async setDatabaseVersion(version: number): Promise<void> {
    await this.setDatabaseMetadata(DB_VERSION_KEY, String(version));
  }
}
