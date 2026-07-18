import type { DatabaseLike as Database } from "../dbType";
import { BaseTable } from "./baseTable";

export interface ArgosUserMessageFileRow {
  message_id: string;
  ordinal: number;
  name: string | null;
  path: string;
  mime_type: string | null;
  size: number | null;
  metadata_json: string | null;
}

const NORMALIZATION_SCHEMA_VERSION = 26;

export class ArgosUserMessageFilesTable extends BaseTable {
  constructor(db: Database) {
    super(db, "argos_user_message_files");
  }

  getCreateTableSQL(): string {
    return `
      CREATE TABLE IF NOT EXISTS argos_user_message_files (
        message_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        name TEXT,
        path TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        metadata_json TEXT,
        PRIMARY KEY (message_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS idx_argos_user_message_files_message
        ON argos_user_message_files(message_id, ordinal);
    `;
  }

  getMigrationSQL(version: number): string | null {
    if (version === NORMALIZATION_SCHEMA_VERSION) {
      return this.getCreateTableSQL();
    }
    return null;
  }

  getLatestVersion(): number {
    return NORMALIZATION_SCHEMA_VERSION;
  }

  replaceForMessage(
    messageId: string,
    files: Array<{
      name?: string;
      path: string;
      mimeType?: string;
      size?: number;
      metadataJson?: string | null;
    }>,
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO argos_user_message_files (
        message_id,
        ordinal,
        name,
        path,
        mime_type,
        size,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      this.delete(messageId);
      files.forEach((file, index) => {
        insert.run(
          messageId,
          index,
          file.name ?? null,
          file.path,
          file.mimeType ?? null,
          file.size ?? null,
          file.metadataJson ?? null,
        );
      });
    })();
  }

  listByMessageIds(messageIds: string[]): ArgosUserMessageFileRow[] {
    if (messageIds.length === 0) {
      return [];
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT * FROM argos_user_message_files
         WHERE message_id IN (${placeholders})
         ORDER BY message_id, ordinal`,
      )
      .all(...messageIds) as ArgosUserMessageFileRow[];
  }

  delete(messageId: string): void {
    this.db.prepare("DELETE FROM argos_user_message_files WHERE message_id = ?").run(messageId);
  }

  deleteByMessageIds(messageIds: string[]): void {
    if (messageIds.length === 0) {
      return;
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    this.db.prepare(`DELETE FROM argos_user_message_files WHERE message_id IN (${placeholders})`).run(...messageIds);
  }

  deleteBySession(sessionId: string): void {
    this.db
      .prepare(
        `DELETE FROM argos_user_message_files
         WHERE message_id IN (
           SELECT id FROM argos_messages WHERE session_id = ?
         )`,
      )
      .run(sessionId);
  }
}
