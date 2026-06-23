import { SQLitePresenter } from "../sqlitePresenter";
import { nanoid } from "nanoid";
import type {
  AgentTapeAnchorResult,
  AgentTapeAnchorsOptions,
  AgentTapeSearchOptions,
  ChatMessageRecord,
} from "@shared/types/agent-interface";
import type { ArgosMessageStore } from "./messageStore";
import type { ArgosTapeEntryRow, ArgosTapeSearchInput } from "../sqlitePresenter/tables/argosTapeEntries";
import { appendMessageRecordToTape } from "./tapeFacts";
import { buildEffectiveTapeView, getLastEffectiveTokenUsage, searchEffectiveTapeRows } from "./tapeEffectiveView";
import { TAPE_VIEW_MANIFEST_EVENT_NAME } from "./tapeViewManifest";
import type { ArgosTapeViewManifest } from "@shared/types/tape-view-manifest";

export type TapeMigrationState = "none" | "ready";

export type TapeBackfillResult = {
  sessionId: string;
  migrationState: TapeMigrationState;
  messageCount: number;
  maxOrderSeq: number;
  appendedFactCount: number;
  historyRecords: ChatMessageRecord[];
};

export type TapeInfo = {
  sessionId: string;
  entries: number;
  anchors: number;
  lastAnchor: string | null;
  lastAnchorEntryId: number | null;
  entriesSinceLastAnchor: number;
  lastTokenUsage: number | null;
  migrationState: TapeMigrationState;
};

export type TapeSearchResult = {
  entryId: number;
  kind: string;
  name: string | null;
  payload: Record<string, unknown>;
  meta: Record<string, unknown>;
  createdAt: number;
};

export type TapeAnchorResult = AgentTapeAnchorResult;

export type TapeForkHandle = {
  parentSessionId: string;
  forkId: string;
  forkSessionId: string;
};

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

function parseSearchBoundary(value: string | undefined, name: string): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  throw new Error(`${name} must be an ISO date/time or millisecond timestamp.`);
}

function toTapeSearchInput(options: AgentTapeSearchOptions | undefined): ArgosTapeSearchInput {
  return {
    limit: options?.limit,
    kinds: options?.kinds,
    startCreatedAt: parseSearchBoundary(options?.start, "start"),
    endCreatedAt: parseSearchBoundary(options?.end, "end"),
  };
}

function migrationProvenanceKey(sessionId: string): string {
  return `migration:${sessionId}:message-backfill:v1`;
}

function legacySummaryProvenanceKey(sessionId: string): string {
  return `summary:${sessionId}:legacy-summary:v1`;
}

function normalizeHandoffName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "handoff/manual";
  }
  if (trimmed.startsWith("handoff/") || trimmed.startsWith("auto_handoff/")) {
    return trimmed;
  }
  return `handoff/${trimmed}`;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return null;
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function buildOrderSeqRange(records: ChatMessageRecord[]): Record<string, number> | null {
  if (records.length === 0) {
    return null;
  }

  return {
    fromOrderSeq: records[0].orderSeq,
    toOrderSeq: records[records.length - 1].orderSeq,
  };
}

function enrichHandoffState(
  state: Record<string, unknown>,
  historyRecords: ChatMessageRecord[],
): Record<string, unknown> {
  const maxOrderSeq = historyRecords.reduce((currentMax, record) => Math.max(currentMax, record.orderSeq), 0);
  const cursorOrderSeq =
    normalizePositiveInteger(state.cursorOrderSeq ?? state.summaryCursorOrderSeq) ?? maxOrderSeq + 1;
  const sourceRecords = historyRecords.filter((record) => record.orderSeq < cursorOrderSeq);
  const enrichedState: Record<string, unknown> = {
    ...state,
    cursorOrderSeq,
  };

  if (!hasOwnKey(enrichedState, "range")) {
    enrichedState.range = buildOrderSeqRange(sourceRecords);
  }

  const sourceMessageIds = enrichedState.sourceMessageIds;
  if (!Array.isArray(sourceMessageIds) || sourceMessageIds.some((id) => typeof id !== "string")) {
    enrichedState.sourceMessageIds = sourceRecords.map((record) => record.id);
  }

  return enrichedState;
}

function forkSessionId(parentSessionId: string, forkId: string): string {
  return `${parentSessionId}::fork::${forkId}`;
}

export class ArgosTapeService {
  constructor(private readonly sqlitePresenter: SQLitePresenter) {}

  private get table(): SQLitePresenter["argosTapeEntriesTable"] | undefined {
    return this.sqlitePresenter.argosTapeEntriesTable;
  }

  ensureSessionTapeReady(sessionId: string, messageStore: ArgosMessageStore): TapeBackfillResult {
    const table = this.table;
    const historyRecords = messageStore.getMessages(sessionId).sort((left, right) => left.orderSeq - right.orderSeq);
    const maxOrderSeq = historyRecords.reduce((currentMax, record) => Math.max(currentMax, record.orderSeq), 0);

    if (!table) {
      return {
        sessionId,
        migrationState: "none",
        messageCount: historyRecords.length,
        maxOrderSeq,
        appendedFactCount: 0,
        historyRecords,
      };
    }

    table.ensureBootstrapAnchor(sessionId);

    let appendedFactCount = 0;
    for (const record of historyRecords) {
      appendedFactCount += appendMessageRecordToTape(table, record, "backfill");
    }

    this.backfillLegacySummaryAnchor(sessionId, historyRecords);

    table.appendEvent({
      sessionId,
      name: "migration/backfill",
      source: {
        type: "migration",
        id: "message-backfill",
        seq: 1,
      },
      provenanceKey: migrationProvenanceKey(sessionId),
      data: {
        source: "argos_messages",
        messageCount: historyRecords.length,
        maxOrderSeq,
      },
      idempotent: true,
    });

    return {
      sessionId,
      migrationState: "ready",
      messageCount: historyRecords.length,
      maxOrderSeq,
      appendedFactCount,
      historyRecords: this.getMessageRecords(sessionId),
    };
  }

  appendMessageRecord(record: ChatMessageRecord): number {
    return appendMessageRecordToTape(this.table, record, "live");
  }

  getViewManifestSourceMaps(sessionId: string): {
    latestEntryId: number;
    anchorEntryIds: number[];
    entryIdByMessageId: Map<string, number>;
  } {
    const table = this.table;
    if (!table) {
      return { latestEntryId: 0, anchorEntryIds: [], entryIdByMessageId: new Map() };
    }

    const rows = table.getBySession(sessionId);
    const entryIdByMessageId = new Map<string, number>();
    let latestEntryId = 0;
    const anchorEntryIds: number[] = [];

    for (const row of rows) {
      latestEntryId = Math.max(latestEntryId, row.entry_id);
      if (row.kind === "anchor") {
        anchorEntryIds.push(row.entry_id);
        continue;
      }
      if (row.kind === "message" && row.source_type === "message" && row.source_id) {
        entryIdByMessageId.set(row.source_id, row.entry_id);
      }
    }

    return { latestEntryId, anchorEntryIds, entryIdByMessageId };
  }

  appendViewManifest(manifest: ArgosTapeViewManifest): ArgosTapeEntryRow | null {
    const table = this.table;
    if (!table) {
      return null;
    }

    table.ensureBootstrapAnchor(manifest.sessionId);
    return table.appendEvent({
      sessionId: manifest.sessionId,
      name: TAPE_VIEW_MANIFEST_EVENT_NAME,
      source: {
        type: "runtime_event",
        id: manifest.messageId,
        seq: manifest.requestSeq,
      },
      provenanceKey: `view:${manifest.sessionId}:${manifest.messageId}:${manifest.requestSeq}:${manifest.hashes.manifestHash}`,
      data: { manifest },
      meta: {
        viewId: manifest.viewId,
        requestSeq: manifest.requestSeq,
        parentViewId: manifest.parentViewId ?? null,
      },
      createdAt: manifest.assembledAt,
      idempotent: true,
    });
  }

  getLastViewManifestId(sessionId: string): string | null {
    const table = this.table;
    if (!table) {
      return null;
    }

    const rows = table.getBySession(sessionId);
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row.kind === "event" && row.name === TAPE_VIEW_MANIFEST_EVENT_NAME) {
        const meta = parseJsonObject(row.meta_json);
        if (typeof meta.viewId === "string") {
          return meta.viewId;
        }
      }
    }
    return null;
  }

  getMessageRecords(sessionId: string): ChatMessageRecord[] {
    const table = this.table;
    return table ? buildEffectiveTapeView(table.getBySession(sessionId), { includePending: true }).messageRecords : [];
  }

  info(sessionId: string): TapeInfo {
    const table = this.table;
    if (!table) {
      return {
        sessionId,
        entries: 0,
        anchors: 0,
        lastAnchor: null,
        lastAnchorEntryId: null,
        entriesSinceLastAnchor: 0,
        lastTokenUsage: null,
        migrationState: "none",
      };
    }

    const lastAnchor = table.getLatestAnchor(sessionId);
    const rows = table.getBySession(sessionId);
    return {
      sessionId,
      entries: table.countBySession(sessionId),
      anchors: table.countAnchorsBySession(sessionId),
      lastAnchor: lastAnchor?.name ?? null,
      lastAnchorEntryId: lastAnchor?.entry_id ?? null,
      entriesSinceLastAnchor: lastAnchor ? table.countEntriesAfter(sessionId, lastAnchor.entry_id) : 0,
      lastTokenUsage: getLastEffectiveTokenUsage(rows),
      migrationState: table.getByProvenanceKey(sessionId, migrationProvenanceKey(sessionId)) ? "ready" : "none",
    };
  }

  search(sessionId: string, query: string, options?: AgentTapeSearchOptions): TapeSearchResult[] {
    const table = this.table;
    return table
      ? searchEffectiveTapeRows(table.getBySession(sessionId), query, toTapeSearchInput(options)).map((row) =>
          this.toSearchResult(row),
        )
      : [];
  }

  anchors(sessionId: string, options: AgentTapeAnchorsOptions = {}): TapeAnchorResult[] {
    const table = this.table;
    return table ? table.getAnchors(sessionId, options.limit).map((row) => this.toAnchorResult(row)) : [];
  }

  handoff(
    sessionId: string,
    name: string,
    state: Record<string, unknown> = {},
    meta: Record<string, unknown> = {},
  ): ArgosTapeEntryRow {
    const table = this.table;
    if (!table) {
      throw new Error("Tape table is not available.");
    }

    table.ensureBootstrapAnchor(sessionId);
    const handoffState = enrichHandoffState(state, this.getMessageRecords(sessionId));
    return table.appendAnchor({
      sessionId,
      name: normalizeHandoffName(name),
      source: {
        type: "runtime_event",
        id: `handoff:${Date.now()}`,
        seq: 0,
      },
      state: handoffState,
      meta: {
        ...meta,
        handoff: true,
      },
    });
  }

  createFork(parentSessionId: string, forkId: string = nanoid()): TapeForkHandle {
    const table = this.table;
    if (!table) {
      throw new Error("Tape table is not available.");
    }

    const forkIdValue = forkId.trim() || nanoid();
    const forkSessionIdValue = forkSessionId(parentSessionId, forkIdValue);
    table.ensureBootstrapAnchor(forkSessionIdValue);
    const parentAnchor = table.getLatestAnchor(parentSessionId);
    table.appendAnchor({
      sessionId: forkSessionIdValue,
      name: "fork/start",
      source: {
        type: "fork",
        id: forkIdValue,
        seq: 0,
      },
      provenanceKey: `fork:${parentSessionId}:${forkIdValue}:start`,
      state: {
        parentSessionId,
        parentLastAnchorEntryId: parentAnchor?.entry_id ?? null,
        parentLastAnchorName: parentAnchor?.name ?? null,
      },
      idempotent: true,
    });
    return {
      parentSessionId,
      forkId: forkIdValue,
      forkSessionId: forkSessionIdValue,
    };
  }

  appendForkMessageRecord(handle: TapeForkHandle, record: ChatMessageRecord): number {
    return appendMessageRecordToTape(
      this.table,
      {
        ...record,
        sessionId: handle.forkSessionId,
      },
      "live",
    );
  }

  mergeFork(parentSessionId: string, forkId: string): number {
    const table = this.table;
    if (!table) {
      return 0;
    }

    const forkSessionIdValue = forkSessionId(parentSessionId, forkId);
    const forkEntries = table
      .getBySession(forkSessionIdValue)
      .filter((entry) => !(entry.kind === "anchor" && entry.name === "session/start"));

    let mergedCount = 0;
    for (const entry of forkEntries) {
      table.append({
        sessionId: parentSessionId,
        kind: entry.kind,
        name: entry.name,
        source: {
          type: "fork",
          id: forkId,
          seq: entry.entry_id,
        },
        provenanceKey: `fork:${parentSessionId}:${forkId}:merge:${entry.entry_id}`,
        payload: parseJsonObject(entry.payload_json),
        meta: {
          ...parseJsonObject(entry.meta_json),
          forkId,
          forkSessionId: forkSessionIdValue,
          mergedFromEntryId: entry.entry_id,
        },
        createdAt: entry.created_at,
        idempotent: true,
      });
      mergedCount += 1;
    }

    table.appendEvent({
      sessionId: parentSessionId,
      name: "fork/merge",
      source: {
        type: "fork",
        id: forkId,
        seq: 0,
      },
      provenanceKey: `fork:${parentSessionId}:${forkId}:merge:event`,
      data: {
        forkId,
        forkSessionId: forkSessionIdValue,
        mergedCount,
      },
      idempotent: true,
    });

    return mergedCount;
  }

  discardFork(parentSessionId: string, forkId: string): void {
    const table = this.table;
    if (!table) {
      return;
    }

    const forkSessionIdValue = forkSessionId(parentSessionId, forkId);
    table.deleteBySession(forkSessionIdValue);
    table.appendEvent({
      sessionId: parentSessionId,
      name: "fork/discard",
      source: {
        type: "fork",
        id: forkId,
        seq: 0,
      },
      provenanceKey: `fork:${parentSessionId}:${forkId}:discard:event`,
      data: {
        forkId,
        forkSessionId: forkSessionIdValue,
      },
      idempotent: true,
    });
  }

  recordExternalForkMerge(
    parentSessionId: string,
    forkSessionIdValue: string,
    forkId: string,
    meta: Record<string, unknown> = {},
  ): ArgosTapeEntryRow {
    const table = this.table;
    if (!table) {
      throw new Error("Tape table is not available.");
    }

    const referencedEntryCount = table.countBySession(forkSessionIdValue);
    return table.appendEvent({
      sessionId: parentSessionId,
      name: "fork/merge",
      source: {
        type: "fork",
        id: forkId,
        seq: 0,
      },
      provenanceKey: `fork:${parentSessionId}:${forkId}:external-merge:event`,
      data: {
        forkId,
        forkSessionId: forkSessionIdValue,
        referencedEntryCount,
        ...meta,
      },
      idempotent: true,
    });
  }

  recordExternalForkDiscard(
    parentSessionId: string,
    forkSessionIdValue: string,
    forkId: string,
    meta: Record<string, unknown> = {},
  ): ArgosTapeEntryRow {
    const table = this.table;
    if (!table) {
      throw new Error("Tape table is not available.");
    }

    return table.appendEvent({
      sessionId: parentSessionId,
      name: "fork/discard",
      source: {
        type: "fork",
        id: forkId,
        seq: 0,
      },
      provenanceKey: `fork:${parentSessionId}:${forkId}:external-discard:event`,
      data: {
        forkId,
        forkSessionId: forkSessionIdValue,
        ...meta,
      },
      idempotent: true,
    });
  }

  private backfillLegacySummaryAnchor(sessionId: string, historyRecords: ChatMessageRecord[]): void {
    const table = this.table;
    if (!table) {
      return;
    }

    if (table.getLatestSummaryAnchor(sessionId)) {
      return;
    }

    const legacyState = this.sqlitePresenter.argosSessionsTable.getSummaryState(sessionId);
    if (!legacyState) {
      return;
    }

    const summary = legacyState.summary_text?.trim();
    if (!summary) {
      return;
    }

    const cursorOrderSeq = Math.max(1, legacyState.summary_cursor_order_seq ?? 1);
    const sourceRecords = historyRecords.filter((record) => record.orderSeq < cursorOrderSeq);
    table.appendAnchor({
      sessionId,
      name: "compaction/migrated_summary",
      source: {
        type: "summary",
        id: "legacy-summary",
        seq: 1,
      },
      provenanceKey: legacySummaryProvenanceKey(sessionId),
      state: {
        summary,
        cursorOrderSeq,
        range:
          sourceRecords.length > 0
            ? {
                fromOrderSeq: sourceRecords[0].orderSeq,
                toOrderSeq: sourceRecords[sourceRecords.length - 1].orderSeq,
              }
            : null,
        sourceMessageIds: sourceRecords.map((record) => record.id),
        migratedFrom: "argos_sessions.summary_text",
      },
      idempotent: true,
      createdAt: legacyState.summary_updated_at ?? undefined,
    });
  }

  private toSearchResult(row: ArgosTapeEntryRow): TapeSearchResult {
    return {
      entryId: row.entry_id,
      kind: row.kind,
      name: row.name,
      payload: parseJsonObject(row.payload_json),
      meta: parseJsonObject(row.meta_json),
      createdAt: row.created_at,
    };
  }

  private toAnchorResult(row: ArgosTapeEntryRow): TapeAnchorResult {
    return {
      sessionId: row.session_id,
      entryId: row.entry_id,
      kind: row.kind,
      name: row.name,
      payload: parseJsonObject(row.payload_json),
      meta: parseJsonObject(row.meta_json),
      createdAt: row.created_at,
    };
  }
}
