import { describe, expect, it, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { BunSessionRepository } from "../src/host/bun-session-repository";

/**
 * Pending-input drain behavior (see docs/issues/daemon-pending-input-drain):
 * steer items send before queued items, one item per turn, rows are restored
 * when delivery fails, and generating sessions are left alone.
 */
describe("pending input drain (resumePendingQueue)", () => {
  let repo: BunSessionRepository;
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new BunSessionRepository(db as never);
  });

  async function seedSession(sessionId: string, generationStatus: string): Promise<void> {
    db.run(
      `INSERT INTO daemon_sessions (id, agent_id, title, status, generation_status, created_at, updated_at)
       VALUES (?, 'argos', 'Test', 'idle', ?, ?, ?)`,
      [sessionId, generationStatus, Date.now(), Date.now()],
    );
  }

  async function insertPending(
    sessionId: string,
    id: string,
    mode: "queue" | "steer",
    text: string,
    queueOrder: number | null,
  ): Promise<void> {
    db.run(
      `INSERT INTO daemon_pending_inputs (id, session_id, mode, state, payload_json, queue_order, claimed_at, consumed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL, ?, ?)`,
      [id, sessionId, mode, JSON.stringify({ text, files: [] }), queueOrder, Date.now(), Date.now()],
    );
  }

  async function listIds(sessionId: string): Promise<string[]> {
    const items = await repo.listPendingInputs(sessionId);
    return items.map((item) => item.id);
  }

  it("does nothing without a wired sender", async () => {
    await seedSession("s1", "idle");
    await insertPending("s1", "a", "queue", "hello", 0);
    await repo.resumePendingQueue("s1");
    expect(await listIds("s1")).toEqual(["a"]);
  });

  it("sends the next steer item before queued items and removes it", async () => {
    await seedSession("s1", "idle");
    await insertPending("s1", "queued-1", "queue", "first queued", 0);
    await insertPending("s1", "steer-1", "steer", "steer me", null);
    await insertPending("s1", "queued-2", "queue", "second queued", 1);

    const delivered: Array<{ sessionId: string; text: string }> = [];
    repo.setPendingQueueSender(async (sessionId, input) => {
      delivered.push({ sessionId, text: input.text });
    });
    await repo.resumePendingQueue("s1");

    expect(delivered).toEqual([{ sessionId: "s1", text: "steer me" }]);
    expect(await listIds("s1")).toEqual(["queued-1", "queued-2"]);
  });

  it("drains one item per call (queue order)", async () => {
    await seedSession("s1", "idle");
    await insertPending("s1", "queued-1", "queue", "one", 0);
    await insertPending("s1", "queued-2", "queue", "two", 1);

    const delivered: string[] = [];
    repo.setPendingQueueSender(async (_sessionId, input) => {
      delivered.push(input.text);
    });

    await repo.resumePendingQueue("s1");
    expect(delivered).toEqual(["one"]);
    await repo.resumePendingQueue("s1");
    expect(delivered).toEqual(["one", "two"]);
    expect(await listIds("s1")).toEqual([]);
  });

  it("skips draining while the session is generating", async () => {
    await seedSession("s1", "generating");
    await insertPending("s1", "a", "queue", "hold", 0);

    const delivered: string[] = [];
    repo.setPendingQueueSender(async (_sessionId, input) => {
      delivered.push(input.text);
    });
    await repo.resumePendingQueue("s1");
    expect(delivered).toEqual([]);
    expect(await listIds("s1")).toEqual(["a"]);
  });

  it("restores the row when delivery fails", async () => {
    await seedSession("s1", "idle");
    await insertPending("s1", "a", "queue", "poison", 0);

    let attempts = 0;
    repo.setPendingQueueSender(async () => {
      attempts += 1;
      throw new Error("provider down");
    });

    await repo.resumePendingQueue("s1");
    expect(attempts).toBe(1);
    expect(await listIds("s1")).toEqual(["a"]);
  });

  it("consumePendingInput deletes on success and restores on failure", async () => {
    await seedSession("s1", "idle");
    await insertPending("s1", "a", "steer", "deliver me", null);

    const seen: string[] = [];
    await repo.consumePendingInput("s1", "a", async (input) => {
      seen.push(input.text);
    });
    expect(seen).toEqual(["deliver me"]);
    expect(await listIds("s1")).toEqual([]);

    await insertPending("s1", "b", "steer", "failing", null);
    await expect(
      repo.consumePendingInput("s1", "b", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(await listIds("s1")).toEqual(["b"]);
  });

  it("is a no-op for sessions without pending inputs", async () => {
    await seedSession("s1", "idle");
    let calls = 0;
    repo.setPendingQueueSender(async () => {
      calls += 1;
    });
    await repo.resumePendingQueue("s1");
    expect(calls).toBe(0);
  });
});
