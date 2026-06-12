import type { IDatabaseProvider } from "@argos/backend-core";
import type Database from "better-sqlite3-multiple-ciphers";

const SQLCIPHER_COMPATIBILITY_VERSION = 4;

export class ElectronDatabaseProvider implements IDatabaseProvider {
  private db: Database.Database | null = null;

  async open(path: string, encryptionKey?: string): Promise<unknown> {
    const DatabaseConstructor = (await import("better-sqlite3-multiple-ciphers")).default;
    this.db = new DatabaseConstructor(path);

    if (encryptionKey) {
      this.db.pragma("cipher='sqlcipher'");
      this.db.pragma(`legacy=${SQLCIPHER_COMPATIBILITY_VERSION}`);
      this.db.key(Buffer.from(encryptionKey, "utf8"));
    }

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getDatabase(): Database.Database | null {
    return this.db;
  }
}
