import { beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { ArgosPendingInputStore } from "#/presenter/agentRuntimePresenter/pendingInputStore";
import type { ArgosPendingInputRow } from "#/presenter/sqlitePresenter/tables/argosPendingInputs";

vi.mock("nanoid", () => ({
  nanoid: vi.fn<(...args: any[]) => any>(),
}));

function createQueueRow(
  id: string,
  sessionId: string,
  queueOrder: number,
  state: ArgosPendingInputRow["state"],
): ArgosPendingInputRow {
  const now = Date.now();

  return {
    id,
    session_id: sessionId,
    mode: "queue",
    state,
    payload_json: JSON.stringify({ text: id, files: [] }),
    queue_order: queueOrder,
    claimed_at: state === "claimed" ? now : null,
    consumed_at: state === "consumed" ? now : null,
    created_at: now,
    updated_at: now,
  };
}

function createStore(initialRows: ArgosPendingInputRow[]) {
  const rows = new Map(initialRows.map((row) => [row.id, { ...row }]));

  const argosPendingInputsTable = {
    insert: vi.fn<(...args: any[]) => any>((row: any) => {
      const now = Date.now();
      rows.set(row.id, {
        id: row.id,
        session_id: row.sessionId,
        mode: row.mode,
        state: row.state ?? "pending",
        payload_json: row.payloadJson,
        queue_order: row.queueOrder ?? null,
        claimed_at: row.claimedAt ?? null,
        consumed_at: row.consumedAt ?? null,
        created_at: row.createdAt ?? now,
        updated_at: row.updatedAt ?? row.createdAt ?? now,
      });
    }),
    get: vi.fn<(...args: any[]) => any>((id: string) => rows.get(id)),
    listBySession: vi.fn<(...args: any[]) => any>((sessionId: string) =>
      Array.from(rows.values()).filter((row) => row.session_id === sessionId),
    ),
    listActiveBySession: vi.fn<(...args: any[]) => any>((sessionId: string) =>
      Array.from(rows.values()).filter((row) => row.session_id === sessionId && row.state !== "consumed"),
    ),
    countActiveBySession: vi.fn<(...args: any[]) => any>(
      (sessionId: string) =>
        Array.from(rows.values()).filter(
          (row) =>
            row.session_id === sessionId &&
            row.state !== "consumed" &&
            !(row.mode === "queue" && row.state === "claimed"),
        ).length,
    ),
    update: vi.fn<(...args: any[]) => any>(),
    delete: vi.fn<(...args: any[]) => any>(),
    deleteBySession: vi.fn<(...args: any[]) => any>(),
    listClaimed: vi.fn<(...args: any[]) => any>(() =>
      Array.from(rows.values()).filter((row) => row.state === "claimed"),
    ),
  };

  const sqlitePresenter = {
    argosPendingInputsTable,
  } as any;

  return {
    store: new ArgosPendingInputStore(sqlitePresenter),
    argosPendingInputsTable,
  };
}

describe("ArgosPendingInputStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns the next queue order after claimed queue rows for pending inserts", () => {
    vi.mocked<(...args: any[]) => any>(nanoid).mockReturnValue("queued-next");
    const { store, argosPendingInputsTable } = createStore([createQueueRow("claimed-1", "session-1", 1, "claimed")]);

    const record = store.createQueueInput("session-1", "hello");

    expect(record.queueOrder).toBe(2);
    expect(argosPendingInputsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "queued-next",
        sessionId: "session-1",
        state: "pending",
        queueOrder: 2,
      }),
    );
  });

  it("assigns the next queue order after all queue rows for claimed inserts", () => {
    vi.mocked<(...args: any[]) => any>(nanoid).mockReturnValue("claimed-next");
    const { store, argosPendingInputsTable } = createStore([
      createQueueRow("pending-1", "session-1", 1, "pending"),
      createQueueRow("claimed-2", "session-1", 2, "claimed"),
    ]);

    const record = store.createQueueInputWithState("session-1", "hello", "claimed");

    expect(record.queueOrder).toBe(3);
    expect(argosPendingInputsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "claimed-next",
        sessionId: "session-1",
        state: "claimed",
        queueOrder: 3,
      }),
    );
  });
});
