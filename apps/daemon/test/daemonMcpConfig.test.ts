import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DaemonMcpConfig } from "../src/host/daemonMcpConfig";

describe("DaemonMcpConfig", () => {
  const cleanupRoots: string[] = [];

  afterEach(() => {
    while (cleanupRoots.length > 0) {
      const root = cleanupRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("initializeHeadlessDefaults restores built-in MCP servers (clears the removal list)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-mcp-"));
    cleanupRoots.push(root);

    const mcpConfig = new DaemonMcpConfig(root, {
      getMcpServers: async () => ({}),
      getMcpEnabled: async () => true,
    } as never);

    // Simulate an existing data dir where an earlier daemon version marked every
    // built-in as user-removed (the old headless-default behavior).
    const store = mcpConfig.mcpConfHelper.getStoreForMigration();
    store.set("removedBuiltInServers", ["Artifacts", "braveSearch", "bochaSearch"]);

    await mcpConfig.initializeHeadlessDefaults();

    // The removal list is cleared so McpConfHelper re-exposes the built-ins.
    expect(store.get("removedBuiltInServers") ?? []).toHaveLength(0);

    // Idempotent: a second run is a no-op (removal list already empty).
    await mcpConfig.initializeHeadlessDefaults();
    expect(store.get("removedBuiltInServers") ?? []).toHaveLength(0);
  });
});
