import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { BunSessionRepository } from "../src/host/bun-session-repository";

function createRepository() {
  const db = new Database(":memory:");
  return new BunSessionRepository(db, {
    publish: () => undefined,
    subscribe: () => () => undefined,
  } as never);
}

describe("BunSessionRepository plan/restricted state", () => {
  it("persists plan and restricted flags at creation", async () => {
    const repo = createRepository();
    const session = await repo.create({ agentId: "argos", message: "", planMode: true, restricted: true }, -1);
    expect(await repo.getPlanMode(session.id)).toBe(true);
    expect(await repo.getRestricted(session.id)).toBe(true);

    await repo.setPlanMode(session.id, false);
    await repo.setRestricted(session.id, false);
    expect(await repo.getPlanMode(session.id)).toBe(false);
    expect(await repo.getRestricted(session.id)).toBe(false);
  });

  it("truncates and restores messages for undo/redo", async () => {
    const repo = createRepository();
    const session = await repo.create({ agentId: "argos", message: "" }, -1);
    const userMessageId = await repo.addMessage(session.id, "user", JSON.stringify({ text: "hello", files: [] }));
    await repo.addMessage(session.id, "assistant", "[]");

    const removed = await repo.truncateMessagesFrom(session.id, userMessageId);
    expect(removed).toHaveLength(2);
    expect(await repo.listMessages(session.id)).toHaveLength(0);

    await repo.restoreMessages(session.id, removed);
    const restored = await repo.listMessages(session.id);
    expect(restored).toHaveLength(2);
    expect(restored[0]?.role).toBe("user");
    expect(restored[1]?.role).toBe("assistant");
  });
});
