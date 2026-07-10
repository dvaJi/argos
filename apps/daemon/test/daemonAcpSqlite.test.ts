import { describe, expect, it, vi } from "vitest";
import { createDaemonAcpSqlitePresenter } from "../src/host/daemonAcpSqlite";

describe("createDaemonAcpSqlitePresenter", () => {
  it("creates and deletes daemon conversations", async () => {
    const rows = new Map<string, unknown[]>();
    const db = {
      prepare(sql: string) {
        return {
          get: () => null,
          all: () => [],
          run: (...params: unknown[]) => {
            if (sql.includes("INSERT INTO daemon_sessions")) {
              rows.set(String(params[0]), params);
            }
            if (sql.includes("DELETE FROM daemon_sessions")) {
              rows.delete(String(params[0]));
            }
            return { changes: 1 };
          },
        };
      },
    };

    const presenter = createDaemonAcpSqlitePresenter(db as never);
    const conversationId = await presenter.createConversation("ACP import", {
      providerId: "acp",
      modelId: "agent-1",
      agentWorkspacePath: "/tmp/workspace",
    });

    expect(conversationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(rows.has(conversationId)).toBe(true);

    await presenter.deleteConversation(conversationId);
    expect(rows.has(conversationId)).toBe(false);
  });
});
