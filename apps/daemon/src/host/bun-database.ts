import type { IDatabaseProvider } from "@argos/backend-core";

export class BunDatabaseProvider implements IDatabaseProvider {
  private db: any = null;
  private dbPath = "";

  async open(path: string, _encryptionKey?: string): Promise<unknown> {
    this.dbPath = path;
    const { Database } = await import("bun:sqlite");
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getDatabase(): any {
    return this.db;
  }
}
