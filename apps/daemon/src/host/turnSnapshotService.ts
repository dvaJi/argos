import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Database as BunDatabase } from "bun:sqlite";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".venv",
  "coverage",
  ".cache",
  "target",
]);
const MAX_FILES = 20_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type Manifest = Record<string, { size: number; mtime: number }>;

interface SnapshotRow {
  session_id: string;
  user_message_id: string;
  workspace: string;
  start_dir: string;
  end_dir: string | null;
  user_text: string;
  start_manifest: string;
  end_manifest: string | null;
  restorable: number;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface UndoResult {
  userMessageId: string;
  inputText: string;
  restored: string[];
  deleted: string[];
  skipped: string[];
  note: string | null;
}

export class TurnSnapshotService {
  constructor(
    private readonly deps: {
      db: BunDatabase;
      dataDir: string;
    },
  ) {
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.deps.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_undo_records (
        session_id TEXT NOT NULL,
        user_message_id TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, user_message_id)
      )
    `);
    this.deps.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_turn_snapshots (
        session_id TEXT NOT NULL,
        user_message_id TEXT NOT NULL,
        workspace TEXT NOT NULL,
        start_dir TEXT NOT NULL,
        end_dir TEXT,
        user_text TEXT NOT NULL,
        start_manifest TEXT NOT NULL,
        end_manifest TEXT,
        restorable INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, user_message_id)
      )
    `);
  }

  async beginTurn(input: {
    sessionId: string;
    userMessageId: string;
    workspace: string | null | undefined;
    userText: string;
  }): Promise<void> {
    if (!input.workspace || !existsSync(input.workspace)) return;
    const existing = this.deps.db
      .prepare("SELECT 1 FROM argos_turn_snapshots WHERE session_id = ? AND user_message_id = ?")
      .get(input.sessionId, input.userMessageId);
    if (existing) return;
    const startDir = this.snapshotDir(input.sessionId, input.userMessageId, "start");
    const result = await this.snapshot(input.workspace, startDir);
    this.deps.db
      .prepare(
        `INSERT INTO argos_turn_snapshots
         (session_id, user_message_id, workspace, start_dir, end_dir, user_text, start_manifest, end_manifest, restorable, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .run(
        input.sessionId,
        input.userMessageId,
        input.workspace,
        startDir,
        input.userText,
        JSON.stringify(result.manifest),
        result.ok ? 1 : 0,
        result.reason ?? (result.skipped.length ? `Skipped ${result.skipped.length} files.` : null),
        Date.now(),
        Date.now(),
      );
  }

  async endTurn(input: { sessionId: string; userMessageId: string }): Promise<void> {
    const row = this.getRow(input.sessionId, input.userMessageId);
    if (!row) return;
    const endDir = this.snapshotDir(input.sessionId, input.userMessageId, "end");
    const result = await this.snapshot(row.workspace, endDir);
    this.deps.db
      .prepare(
        "UPDATE argos_turn_snapshots SET end_dir = ?, end_manifest = ?, restorable = ?, note = ?, updated_at = ? WHERE session_id = ? AND user_message_id = ?",
      )
      .run(
        endDir,
        JSON.stringify(result.manifest),
        row.restorable === 1 && result.ok ? 1 : 0,
        result.reason ?? row.note,
        Date.now(),
        input.sessionId,
        input.userMessageId,
      );
  }

  state(sessionId: string): {
    available: boolean;
    canRedo: boolean;
    userMessageId: string | null;
    note: string | null;
  } {
    const row = this.latest(sessionId);
    const undoRecord = row ? this.getUndoRecord(sessionId, row.user_message_id) : undefined;
    return {
      available: Boolean(row && row.restorable === 1 && row.end_manifest),
      canRedo: Boolean(row && row.restorable === 1 && row.end_manifest && row.end_dir && undoRecord),
      userMessageId: row?.user_message_id ?? null,
      note: row?.note ?? null,
    };
  }

  recordUndo(sessionId: string, userMessageId: string, messages: unknown[]): void {
    this.deps.db
      .prepare(
        `INSERT INTO argos_undo_records (session_id, user_message_id, messages_json, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id, user_message_id) DO UPDATE SET
           messages_json = excluded.messages_json, created_at = excluded.created_at`,
      )
      .run(sessionId, userMessageId, JSON.stringify(messages), Date.now());
  }

  getUndoMessages(sessionId: string, userMessageId: string): unknown[] | null {
    const row = this.getUndoRecord(sessionId, userMessageId);
    if (!row) return null;
    try {
      return JSON.parse(row.messages_json) as unknown[];
    } catch {
      return null;
    }
  }

  clearUndo(sessionId: string, userMessageId: string): void {
    this.deps.db
      .prepare("DELETE FROM argos_undo_records WHERE session_id = ? AND user_message_id = ?")
      .run(sessionId, userMessageId);
  }

  private getUndoRecord(sessionId: string, userMessageId: string): { messages_json: string } | undefined {
    return this.deps.db
      .prepare("SELECT messages_json FROM argos_undo_records WHERE session_id = ? AND user_message_id = ?")
      .get(sessionId, userMessageId) as { messages_json: string } | undefined;
  }

  async undo(sessionId: string, userMessageId?: string): Promise<UndoResult> {
    const row = userMessageId ? this.getRow(sessionId, userMessageId) : this.latest(sessionId);
    if (!row || !row.end_manifest || !row.end_dir) throw new Error("There is no completed turn to undo.");
    if (row.restorable !== 1) throw new Error(row.note ?? "This turn cannot be undone.");
    const result = await restore(row.workspace, row.start_dir, row.start_manifest, row.end_manifest);
    return {
      userMessageId: row.user_message_id,
      inputText: row.user_text,
      restored: result.restored,
      deleted: result.deleted,
      skipped: result.skipped,
      note: row.note,
    };
  }

  async redo(sessionId: string, userMessageId: string): Promise<UndoResult> {
    const row = this.getRow(sessionId, userMessageId);
    if (!row || !row.end_manifest || !row.end_dir) throw new Error("There is no turn to redo.");
    if (row.restorable !== 1) throw new Error(row.note ?? "This turn cannot be redone.");
    const result = await restore(row.workspace, row.end_dir, row.end_manifest, row.start_manifest);
    return {
      userMessageId: row.user_message_id,
      inputText: row.user_text,
      restored: result.restored,
      deleted: result.deleted,
      skipped: result.skipped,
      note: row.note,
    };
  }

  private async snapshot(
    workspace: string,
    destination: string,
  ): Promise<{ ok: boolean; manifest: Manifest; skipped: string[]; reason?: string }> {
    const manifest: Manifest = {};
    const skipped: string[] = [];
    const entries: Array<{ relative: string; absolute: string; size: number; mtime: number }> = [];
    let totalBytes = 0;

    const walk = async (directory: string) => {
      if (entries.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) return;
      let items;
      try {
        items = await readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const item of items) {
        if (entries.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) return;
        if (item.isSymbolicLink()) {
          skipped.push(path.relative(workspace, path.join(directory, item.name)));
          continue;
        }
        const absolute = path.join(directory, item.name);
        if (item.isDirectory()) {
          if (SKIP_DIRS.has(item.name)) {
            skipped.push(path.relative(workspace, absolute));
            continue;
          }
          await walk(absolute);
          continue;
        }
        if (!item.isFile()) continue;
        let info;
        try {
          info = await lstat(absolute);
        } catch {
          continue;
        }
        if (info.size > MAX_FILE_BYTES) {
          skipped.push(path.relative(workspace, absolute));
          continue;
        }
        totalBytes += info.size;
        entries.push({
          relative: path.relative(workspace, absolute).split(path.sep).join("/"),
          absolute,
          size: info.size,
          mtime: info.mtimeMs,
        });
      }
    };
    await walk(workspace);
    if (entries.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
      await rm(destination, { recursive: true, force: true });
      return {
        ok: false,
        manifest: {},
        skipped,
        reason: "The workspace is too large for undo (20,000 files / 256 MB limit).",
      };
    }

    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const entry of entries) {
      const target = path.join(destination, entry.relative);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await Bun.write(target, Bun.file(entry.absolute));
      } catch {
        skipped.push(entry.relative);
        continue;
      }
      manifest[entry.relative] = { size: entry.size, mtime: entry.mtime };
    }
    return { ok: true, manifest, skipped };
  }

  private snapshotDir(sessionId: string, userMessageId: string, phase: "start" | "end"): string {
    return path.join(this.deps.dataDir, "undo", sessionId, userMessageId, phase);
  }

  private getRow(sessionId: string, userMessageId: string): SnapshotRow | undefined {
    return this.deps.db
      .prepare("SELECT * FROM argos_turn_snapshots WHERE session_id = ? AND user_message_id = ?")
      .get(sessionId, userMessageId) as SnapshotRow | undefined;
  }

  private latest(sessionId: string): SnapshotRow | undefined {
    return this.deps.db
      .prepare("SELECT * FROM argos_turn_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(sessionId) as SnapshotRow | undefined;
  }
}

async function restore(
  workspace: string,
  snapshotDir: string,
  targetManifestJson: string,
  otherManifestJson: string,
): Promise<{ restored: string[]; deleted: string[]; skipped: string[] }> {
  const target = JSON.parse(targetManifestJson) as Manifest;
  const other = JSON.parse(otherManifestJson) as Manifest;
  const paths = new Set([...Object.keys(target), ...Object.keys(other)]);
  const restored: string[] = [];
  const deleted: string[] = [];
  const skipped: string[] = [];
  const root = path.resolve(workspace);

  for (const relative of paths) {
    const absolute = path.resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      skipped.push(relative);
      continue;
    }
    const before = target[relative];
    const after = other[relative];
    if (before && after && before.size === after.size && before.mtime === after.mtime) continue;
    if (!before) {
      await rm(absolute, { force: true });
      deleted.push(relative);
      continue;
    }
    try {
      await mkdir(path.dirname(absolute), { recursive: true });
      await Bun.write(absolute, Bun.file(path.join(snapshotDir, relative)));
      restored.push(relative);
    } catch {
      skipped.push(relative);
    }
  }
  return { restored, deleted, skipped };
}
