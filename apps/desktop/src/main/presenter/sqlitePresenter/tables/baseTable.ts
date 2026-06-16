import Database from "better-sqlite3-multiple-ciphers";

export abstract class BaseTable {
  protected db: Database.Database;
  protected tableName: string;

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  // Get the table creation SQL
  abstract getCreateTableSQL(): string;

  // Get the table upgrade SQL (if any)
  abstract getMigrationSQL?(version: number): string | null;

  // Get the latest migration version number
  abstract getLatestVersion(): number;

  // Check whether the table exists
  protected tableExists(): boolean {
    const result = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(this.tableName) as { name: string } | undefined;

    return !!result;
  }

  protected hasColumn(columnName: string): boolean {
    if (!this.tableExists()) {
      return false;
    }

    const rows = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all() as Array<{
      name: string;
    }>;
    return rows.some((row) => row.name === columnName);
  }

  protected getRecordedSchemaVersion(): number {
    const versionTable = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'`)
      .get() as { name: string } | undefined;

    if (!versionTable) {
      return 0;
    }

    const result = this.db.prepare("SELECT MAX(version) as version FROM schema_versions").get() as
      | { version: number | null }
      | undefined;

    return result?.version ?? 0;
  }

  // Execute table creation
  public createTable(): void {
    if (!this.tableExists()) {
      this.db.exec(this.getCreateTableSQL());
    }
  }
}
