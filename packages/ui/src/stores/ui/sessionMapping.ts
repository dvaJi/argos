import type {
  ArgosSubagentMeta,
  SessionKind,
  SessionListItem,
  SessionWithState,
} from "@argos/shared/types/agent-interface";

/**
 * Pure session record → UI mapping (no stores, no bridge), so lifecycle logic
 * and tests can map raw daemon records without importing the session store.
 */

export type UISessionStatus = "completed" | "working" | "error" | "none" | "new_results" | "blocked";

export interface UISession {
  id: string;
  title: string;
  agentId: string;
  status: UISessionStatus;
  projectDir: string;
  isPinned: boolean;
  isDraft: boolean;
  sessionKind: SessionKind;
  parentSessionId: string | null;
  subagentEnabled: boolean;
  subagentMeta: ArgosSubagentMeta | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Model binding of the session when the source payload carries it
   * (`sessions.list` does). Optional because some internal callers construct
   * UISession from partial data.
   */
  providerId?: string;
  modelId?: string;
  /** Archive time (docs/features/thread-archive); archived sessions are kept out of `sessions`. */
  archivedAt?: number | null;
}

export function mapSessionStatus(status: string): UISessionStatus {
  switch (status) {
    case "generating":
      return "working";
    case "blocked":
      return "blocked";
    case "done":
      return "new_results";
    case "error":
      return "error";
    case "idle":
      return "none";
    default:
      return "none";
  }
}

export function mapToUISession(session: SessionListItem | SessionWithState): UISession {
  return {
    id: session.id,
    title: session.title,
    agentId: session.agentId,
    status: mapSessionStatus(session.status),
    projectDir: session.projectDir ?? "",
    isPinned: Boolean(session.isPinned),
    isDraft: Boolean(session.isDraft),
    sessionKind: session.sessionKind,
    parentSessionId: session.parentSessionId ?? null,
    subagentEnabled: session.subagentEnabled,
    subagentMeta: session.subagentMeta ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    // Keep the model binding on list items so the composer can resolve the
    // active session's model before (or without) fetching the full summary.
    providerId: session.providerId ?? undefined,
    modelId: session.modelId ?? undefined,
    archivedAt: session.archivedAt ?? null,
  };
}
