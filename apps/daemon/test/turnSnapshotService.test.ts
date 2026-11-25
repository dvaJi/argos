import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TurnSnapshotService } from "../src/host/turnSnapshotService";

const tempDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("TurnSnapshotService", () => {
  it("restores modified, added, and deleted files, and redoes the turn", async () => {
    const workspace = await tempDir("argos-undo-workspace-");
    const dataDir = await tempDir("argos-undo-data-");
    await writeFile(path.join(workspace, "a.txt"), "one");
    await writeFile(path.join(workspace, "b.txt"), "keep");
    await writeFile(path.join(workspace, "untouched.txt"), "old");
    const db = new Database(":memory:");
    const service = new TurnSnapshotService({ db, dataDir });

    await service.beginTurn({ sessionId: "session-1", userMessageId: "user-1", workspace, userText: "change a" });
    await writeFile(path.join(workspace, "a.txt"), "two");
    await writeFile(path.join(workspace, "c.txt"), "added");
    await rm(path.join(workspace, "b.txt"));
    await service.endTurn({ sessionId: "session-1", userMessageId: "user-1" });
    await writeFile(path.join(workspace, "untouched.txt"), "user change");

    expect(service.state("session-1").available).toBe(true);

    const undo = await service.undo("session-1");
    expect(await readFile(path.join(workspace, "a.txt"), "utf8")).toBe("one");
    expect(await readFile(path.join(workspace, "b.txt"), "utf8")).toBe("keep");
    await expect(readFile(path.join(workspace, "c.txt"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(workspace, "untouched.txt"), "utf8")).toBe("user change");
    expect(undo.restored).toContain("a.txt");
    expect(undo.deleted).toContain("c.txt");

    service.recordUndo("session-1", "user-1", [{ id: "message-1" }]);
    expect(service.state("session-1").canRedo).toBe(true);
    await service.redo("session-1", "user-1");
    expect(await readFile(path.join(workspace, "a.txt"), "utf8")).toBe("two");
    expect(await readFile(path.join(workspace, "c.txt"), "utf8")).toBe("added");
    await expect(readFile(path.join(workspace, "b.txt"), "utf8")).rejects.toThrow();
  });

  it("skips large files", async () => {
    const workspace = await tempDir("argos-undo-large-");
    const dataDir = await tempDir("argos-undo-large-data-");
    await writeFile(path.join(workspace, "small.txt"), "ok");
    await writeFile(path.join(workspace, "big.bin"), Buffer.alloc(2 * 1024 * 1024 + 1));
    const db = new Database(":memory:");
    const service = new TurnSnapshotService({ db, dataDir });
    await service.beginTurn({ sessionId: "s", userMessageId: "u", workspace, userText: "x" });
    await service.endTurn({ sessionId: "s", userMessageId: "u" });
    const undo = await service.undo("s");
    expect(undo.skipped.length).toBe(0);
    expect(service.state("s").note).toContain("Skipped");
  });
});
