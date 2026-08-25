import { nanoid } from "nanoid";
import type {
  ArgosSubagentMeta,
  SessionKind,
  SessionPageCursor,
  SessionRecord,
} from "@argos/shared/types/agent-interface";

interface InternalSessionRecord extends SessionRecord {
  disabledAgentTools: string[];
}

/**
 * In-memory session record store for the desktop shell.
 *
 * The daemon owns all session persistence (argos.db); this registry only tracks
 * shell-local session state (window bindings, drafts, active sessions) so the
 * desktop facade keeps working without any SQLite dependency.
 */
export class NewSessionManager {
  // id → session record
  private sessions = new Map<string, InternalSessionRecord>();
  // webContentsId → sessionId
  private windowBindings: Map<number, string | null> = new Map();

  create(
    agentId: string,
    title: string,
    projectDir: string | null,
    options?: {
      isDraft?: boolean;
      disabledAgentTools?: string[];
      subagentEnabled?: boolean;
      sessionKind?: SessionKind;
      parentSessionId?: string | null;
      subagentMeta?: ArgosSubagentMeta | null;
    },
  ): string {
    const id = nanoid();
    const now = Date.now();
    this.sessions.set(id, {
      id,
      agentId,
      title,
      projectDir,
      isPinned: false,
      isDraft: options?.isDraft ?? false,
      sessionKind: options?.sessionKind ?? "regular",
      parentSessionId: options?.parentSessionId ?? null,
      subagentEnabled: options?.subagentEnabled ?? true,
      subagentMeta: options?.subagentMeta ?? null,
      disabledAgentTools: options?.disabledAgentTools ?? [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  get(id: string): SessionRecord | null {
    const record = this.sessions.get(id);
    if (!record) {
      return null;
    }
    return this.toPublicRecord(record);
  }

  getMany(ids: string[]): SessionRecord[] {
    const records: SessionRecord[] = [];
    for (const id of ids) {
      const record = this.sessions.get(id);
      if (record) {
        records.push(this.toPublicRecord(record));
      }
    }
    return records;
  }

  listPage(options?: {
    limit?: number;
    cursor?: SessionPageCursor | null;
    agentId?: string;
    includeSubagents?: boolean;
    parentSessionId?: string;
  }): {
    records: SessionRecord[];
    nextCursor: SessionPageCursor | null;
    hasMore: boolean;
  } {
    const filtered = this.list(options);
    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : -1));

    let startIndex = 0;
    if (options?.cursor) {
      startIndex = sorted.findIndex((r) => r.updatedAt === options.cursor!.updatedAt && r.id === options.cursor!.id);
      if (startIndex < 0) {
        startIndex = sorted.findIndex((r) => r.updatedAt < options.cursor!.updatedAt);
      }
      if (startIndex < 0) {
        startIndex = sorted.length;
      } else {
        startIndex += 1;
      }
    }

    const limit = options?.limit ?? 20;
    const page = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < sorted.length;
    const lastRecord = page.at(-1);

    return {
      records: page,
      nextCursor: hasMore && lastRecord ? { updatedAt: lastRecord.updatedAt, id: lastRecord.id } : null,
      hasMore,
    };
  }

  list(filters?: {
    agentId?: string;
    projectDir?: string;
    includeSubagents?: boolean;
    parentSessionId?: string;
  }): SessionRecord[] {
    const records: SessionRecord[] = [];
    for (const record of this.sessions.values()) {
      if (filters?.agentId !== undefined && record.agentId !== filters.agentId) {
        continue;
      }
      if (filters?.projectDir !== undefined && record.projectDir !== filters.projectDir) {
        continue;
      }
      if (filters?.parentSessionId !== undefined && record.parentSessionId !== filters.parentSessionId) {
        continue;
      }
      if (filters?.includeSubagents === false && record.sessionKind === "subagent") {
        continue;
      }
      records.push(this.toPublicRecord(record));
    }
    return records;
  }

  update(
    id: string,
    fields: Partial<
      Pick<
        SessionRecord,
        | "title"
        | "projectDir"
        | "isPinned"
        | "isDraft"
        | "sessionKind"
        | "parentSessionId"
        | "subagentEnabled"
        | "subagentMeta"
      >
    >,
  ): void {
    const current = this.sessions.get(id);
    if (!current) {
      return;
    }

    const updated: InternalSessionRecord = {
      ...current,
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.projectDir !== undefined ? { projectDir: fields.projectDir } : {}),
      ...(fields.isPinned !== undefined ? { isPinned: fields.isPinned } : {}),
      ...(fields.isDraft !== undefined ? { isDraft: fields.isDraft } : {}),
      ...(fields.sessionKind !== undefined ? { sessionKind: fields.sessionKind } : {}),
      ...(fields.parentSessionId !== undefined ? { parentSessionId: fields.parentSessionId } : {}),
      ...(fields.subagentEnabled !== undefined ? { subagentEnabled: fields.subagentEnabled } : {}),
      ...(fields.subagentMeta !== undefined ? { subagentMeta: fields.subagentMeta } : {}),
      updatedAt: Date.now(),
    };
    this.sessions.set(id, updated);
  }

  delete(id: string): void {
    this.sessions.delete(id);
    for (const [webContentsId, sessionId] of this.windowBindings) {
      if (sessionId === id) {
        this.windowBindings.set(webContentsId, null);
      }
    }
  }

  getDisabledAgentTools(id: string): string[] {
    return this.sessions.get(id)?.disabledAgentTools ?? [];
  }

  updateDisabledAgentTools(id: string, disabledAgentTools: string[]): void {
    const current = this.sessions.get(id);
    if (!current) {
      return;
    }
    this.sessions.set(id, { ...current, disabledAgentTools, updatedAt: Date.now() });
  }

  updateAgentId(id: string, agentId: string): void {
    const current = this.sessions.get(id);
    if (!current || current.agentId === agentId) {
      return;
    }
    this.sessions.set(id, { ...current, agentId, updatedAt: Date.now() });
  }

  // Window binding management
  bindWindow(webContentsId: number, sessionId: string): void {
    this.windowBindings.set(webContentsId, sessionId);
  }

  unbindWindow(webContentsId: number): void {
    this.windowBindings.set(webContentsId, null);
  }

  getActiveSessionId(webContentsId: number): string | null {
    return this.windowBindings.get(webContentsId) ?? null;
  }

  private toPublicRecord(record: InternalSessionRecord): SessionRecord {
    const { disabledAgentTools: _disabledAgentTools, ...publicRecord } = record;
    return publicRecord;
  }
}
