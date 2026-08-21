import { describe, expect, it, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { BunSessionRepository } from "../src/host/bun-session-repository";

/**
 * Startup recovery for turns orphaned by a daemon restart
 * (see docs/issues/daemon-recover-interrupted-turns): sessions stuck in
 * `generating` move to `error`, and their in-flight assistant message is
 * finalized with an error block instead of rendering empty.
 */
describe("recoverInterruptedTurns", () => {
  let repo: BunSessionRepository;
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new BunSessionRepository(db as never);
  });

  function seedSession(sessionId: string, generationStatus: string): void {
    db.run(
      `INSERT INTO daemon_sessions (id, agent_id, title, status, generation_status, created_at, updated_at)
       VALUES (?, 'argos', 'Test', 'idle', ?, ?, ?)`,
      [sessionId, generationStatus, Date.now(), Date.now()],
    );
  }

  function addMessage(sessionId: string, role: string, content: string): string {
    const id = `msg-${Math.random().toString(36).slice(2, 10)}`;
    db.run(
      `INSERT INTO daemon_messages (id, session_id, role, content, created_at, updated_at, metadata, status, is_context_edge, trace_count)
       VALUES (?, ?, ?, ?, ?, ?, '{}', 'sent', 0, 0)`,
      [id, sessionId, role, content, Date.now(), Date.now()],
    );
    return id;
  }

  function getMessage(messageId: string): { content: string; status: string; metadata: string } {
    return db.prepare("SELECT content, status, metadata FROM daemon_messages WHERE id = ?").get(messageId) as {
      content: string;
      status: string;
      metadata: string;
    };
  }

  it("recovers an empty in-flight assistant message with an error block", async () => {
    seedSession("s1", "generating");
    addMessage("s1", "user", JSON.stringify({ text: "hello" }));
    const assistantId = addMessage("s1", "assistant", "[]");

    const recovered = await repo.recoverInterruptedTurns();

    expect(recovered).toEqual(["s1"]);
    const message = getMessage(assistantId);
    expect(message.status).toBe("error");
    const blocks = JSON.parse(message.content);
    expect(blocks.at(-1)).toMatchObject({ type: "error", status: "error" });
    expect(JSON.parse(message.metadata)).toMatchObject({ runtime: "recovery" });

    const session = db.prepare("SELECT generation_status FROM daemon_sessions WHERE id = 's1'").get() as any;
    expect(session.generation_status).toBe("error");
  });

  it("flips streaming blocks to error but preserves settled content", async () => {
    seedSession("s1", "generating");
    const assistantId = addMessage(
      "s1",
      "assistant",
      JSON.stringify([
        { type: "content", content: "partial answer", status: "loading", timestamp: 1 },
        { type: "tool_call", status: "success", timestamp: 2, tool_call: { id: "t1", name: "read" } },
        { type: "tool_call", status: "loading", timestamp: 3, tool_call: { id: "t2", name: "bash" } },
      ]),
    );

    await repo.recoverInterruptedTurns();

    const blocks = JSON.parse(getMessage(assistantId).content);
    expect(blocks[0]).toMatchObject({ type: "content", content: "partial answer", status: "error" });
    expect(blocks[1]).toMatchObject({ status: "success" });
    expect(blocks[2]).toMatchObject({ status: "error" });
    // Settled content existed: no synthetic interruption block appended.
    expect(blocks).toHaveLength(3);
  });

  it("leaves non-generating sessions untouched", async () => {
    seedSession("s1", "idle");
    seedSession("s2", "error");
    const assistantId = addMessage("s1", "assistant", "[]");

    const recovered = await repo.recoverInterruptedTurns();

    expect(recovered).toEqual([]);
    expect(getMessage(assistantId).status).toBe("sent");
    expect(JSON.parse(getMessage(assistantId).content)).toEqual([]);
  });

  it("marks a generating session error even without any assistant message", async () => {
    seedSession("s1", "generating");

    const recovered = await repo.recoverInterruptedTurns();

    expect(recovered).toEqual(["s1"]);
    const session = db.prepare("SELECT generation_status FROM daemon_sessions WHERE id = 's1'").get() as any;
    expect(session.generation_status).toBe("error");
  });

  it("continues recovering when one session row is broken", async () => {
    seedSession("s1", "generating");
    seedSession("s2", "generating");
    // Corrupt s1's message content so its JSON parse path is exercised and
    // recovery of s2 still proceeds.
    addMessage("s1", "assistant", "not-json{{");

    const recovered = await repo.recoverInterruptedTurns();

    expect(recovered).toContain("s1");
    expect(recovered).toContain("s2");
  });

  it("is idempotent across repeated recovery passes", async () => {
    seedSession("s1", "generating");
    addMessage("s1", "user", JSON.stringify({ text: "hello" }));
    const assistantId = addMessage("s1", "assistant", "[]");

    // First pass resets the session to error; simulate a crash between the
    // message update and the session status update by re-marking generating.
    await repo.recoverInterruptedTurns();
    db.run("UPDATE daemon_sessions SET generation_status = 'generating' WHERE id = 's1'");
    await repo.recoverInterruptedTurns();

    const blocks = JSON.parse(getMessage(assistantId).content);
    const errorBlocks = blocks.filter((block: any) => block.type === "error");
    expect(errorBlocks).toHaveLength(1);
  });
});
