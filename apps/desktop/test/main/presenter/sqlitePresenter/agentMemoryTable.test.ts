import { describe, expect, it } from "vitest";

const sqliteModule = await import("better-sqlite3-multiple-ciphers").catch(() => null);
const tableModule = sqliteModule
  ? await import("../../../../src/main/presenter/sqlitePresenter/tables/agentMemory")
  : null;

const Database = sqliteModule?.default;
const AgentMemoryTable = tableModule?.AgentMemoryTable;
const DatabaseCtor = Database!;
const AgentMemoryTableCtor = AgentMemoryTable!;

let sqliteAvailable = false;
if (Database) {
  try {
    const smokeDb = new Database(":memory:");
    smokeDb.close();
    sqliteAvailable = true;
  } catch {
    sqliteAvailable = false;
  }
}

const describeIfSqlite = sqliteAvailable ? describe : describe.skip;

describeIfSqlite("AgentMemoryTable", () => {
  function createTable() {
    const db = new DatabaseCtor(":memory:");
    const table = new AgentMemoryTableCtor(db);
    table.createTable();
    return { db, table };
  }

  it("inserts rows, enforces provenance dedupe, and searches content", () => {
    const { db, table } = createTable();

    const first = table.insert({
      id: "mem-1",
      agentId: "agent-1",
      kind: "semantic",
      content: "Remember the default port is 3000.",
      sourceSession: "session-1",
      sourceEntryIds: [1, 2],
      provenanceKey: "semantic:dedupe",
    });
    table.updateStatus(first.id, "embedded", {
      embeddingId: first.id,
      embeddingDim: 3,
      embeddingModel: "provider:model",
    });
    table.recordAccess(first.id, 123);

    expect(table.getById(first.id)).toMatchObject({
      id: "mem-1",
      agent_id: "agent-1",
      source_entry_ids: "[1,2]",
      access_count: 1,
      accessed_at: 123,
    });
    expect(table.getByProvenanceKey("agent-1", "semantic:dedupe")).toMatchObject({ id: "mem-1" });
    expect(
      table.insert({
        id: "mem-2",
        agentId: "agent-1",
        kind: "semantic",
        content: "Remember the default port is 3000.",
        provenanceKey: "semantic:dedupe",
      }),
    ).toMatchObject({ id: "mem-2" });

    const rows = table.search("agent-1", "default port", 10);
    expect(rows.map((row) => row.id)).toContain("mem-1");

    db.close();
  });

  it("tracks pending rows and clears by agent", () => {
    const { db, table } = createTable();

    table.insert({
      id: "mem-1",
      agentId: "agent-1",
      kind: "episodic",
      content: "Task finished successfully.",
      provenanceKey: "episodic:one",
    });
    table.insert({
      id: "mem-2",
      agentId: "agent-1",
      kind: "persona",
      content: "Helpful and concise.",
      status: "fts_only",
      provenanceKey: "persona:one",
    });
    table.updateStatus("mem-1", "pending_embedding");

    expect(table.listPendingEmbedding()).toHaveLength(1);
    expect(table.countByAgent("agent-1")).toBe(2);
    expect(table.clearByAgent("agent-1")).toBe(2);
    expect(table.countByAgent("agent-1")).toBe(0);

    db.close();
  });
});
