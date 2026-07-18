import type { DatabaseLike as Database } from "../dbType";
import { BaseTable } from "./baseTable";

export interface ArgosUserMessageRow {
  message_id: string;
  text: string;
  search_enabled: number;
  think_enabled: number;
}

const NORMALIZATION_SCHEMA_VERSION = 26;

export class ArgosUserMessagesTable extends BaseTable {
  constructor(db: Database) {
    super(db, "argos_user_messages");
  }

  getCreateTableSQL(): string {
    return `
      CREATE TABLE IF NOT EXISTS argos_user_messages (
        message_id TEXT PRIMARY KEY,
        text TEXT NOT NULL DEFAULT '',
        search_enabled INTEGER NOT NULL DEFAULT 0,
        think_enabled INTEGER NOT NULL DEFAULT 0
      );
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

  upsert(row: { messageId: string; text: string; searchEnabled: boolean; thinkEnabled: boolean }): void {
    this.db
      .prepare(
        `INSERT INTO argos_user_messages (
          message_id,
          text,
          search_enabled,
          think_enabled
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          text = excluded.text,
          search_enabled = excluded.search_enabled,
          think_enabled = excluded.think_enabled`,
      )
      .run(row.messageId, row.text, row.searchEnabled ? 1 : 0, row.thinkEnabled ? 1 : 0);
  }

  get(messageId: string): ArgosUserMessageRow | undefined {
    return this.db.prepare("SELECT * FROM argos_user_messages WHERE message_id = ?").get(messageId) as
      | ArgosUserMessageRow
      | undefined;
  }

  listByMessageIds(messageIds: string[]): ArgosUserMessageRow[] {
    if (messageIds.length === 0) {
      return [];
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM argos_user_messages WHERE message_id IN (${placeholders}) ORDER BY message_id`)
      .all(...messageIds) as ArgosUserMessageRow[];
  }

  delete(messageId: string): void {
    this.db.prepare("DELETE FROM argos_user_messages WHERE message_id = ?").run(messageId);
  }

  deleteByMessageIds(messageIds: string[]): void {
    if (messageIds.length === 0) {
      return;
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    this.db.prepare(`DELETE FROM argos_user_messages WHERE message_id IN (${placeholders})`).run(...messageIds);
  }

  deleteBySession(sessionId: string): void {
    this.db
      .prepare(
        `DELETE FROM argos_user_messages
         WHERE message_id IN (
           SELECT id FROM argos_messages WHERE session_id = ?
         )`,
      )
      .run(sessionId);
  }
}
