import type { ArgosSubagentMeta, SessionRecord } from "@shared/types/agent-interface";

export const parseSubagentMeta = (raw: string | null | undefined): ArgosSubagentMeta | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ArgosSubagentMeta>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.slotId !== "string") {
      return null;
    }

    return {
      slotId: parsed.slotId,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : parsed.slotId,
      targetAgentId:
        parsed.targetAgentId === null || typeof parsed.targetAgentId === "string" ? parsed.targetAgentId : undefined,
    };
  } catch {
    return null;
  }
};

export type SessionRow = {
  id: string;
  agent_id: string;
  title: string;
  project_dir: string | null;
  is_pinned: number;
  is_draft: number;
  session_kind: string;
  parent_session_id: string | null;
  subagent_enabled: number;
  subagent_meta_json: string | null;
  created_at: number;
  updated_at: number;
};

export function mapRowToRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    projectDir: row.project_dir,
    isPinned: row.is_pinned === 1,
    isDraft: row.is_draft === 1,
    sessionKind: row.session_kind === "subagent" ? "subagent" : "regular",
    parentSessionId: row.parent_session_id ?? null,
    subagentEnabled: row.subagent_enabled === 1,
    subagentMeta: parseSubagentMeta(row.subagent_meta_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SessionStore {
  create(
    id: string,
    agentId: string,
    title: string,
    projectDir: string | null,
    options?: Record<string, unknown>,
  ): void;
  get(id: string): SessionRow | null;
  getMany(ids: string[]): SessionRow[];
  list(options?: {
    agentId?: string;
    projectDir?: string;
    includeSubagents?: boolean;
    parentSessionId?: string;
  }): SessionRow[];
  update(id: string, fields: Record<string, unknown>): void;
  delete(id: string): void;
  getDisabledAgentTools(id: string): string[];
  updateDisabledAgentTools(id: string, tools: string[]): void;
  updateAgentId(id: string, agentId: string): void;
}
