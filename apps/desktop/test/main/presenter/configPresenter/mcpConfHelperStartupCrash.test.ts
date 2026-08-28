import { describe, expect, it, vi } from "vitest";
import type { StoreFactory } from "@argos/backend-core";
import { McpConfHelper } from "@argos/mcp-runtime";

/**
 * Regression test for the cold-start crash:
 * `[Mcp] Initialization failed: TypeError: Cannot read properties of undefined (reading 'powerpack')`
 *
 * A StoreLike implementation whose `get(key, defaultValue)` returned undefined (the
 * pre-fix DaemonMirrorStore behavior) made McpConfHelper.getMcpServers() crash inside
 * removeDeprecatedBuiltInServers(undefined). The helper must tolerate an undefined read.
 */
describe("McpConfHelper startup crash regression", () => {
  it("getMcpServers() resolves when the store returns undefined for mcpServers", async () => {
    const get = vi.fn(() => undefined);
    const set = vi.fn();
    const store = {
      get,
      set,
      delete: vi.fn(),
      has: vi.fn(() => false),
      store: {} as Record<string, unknown>,
    };

    const helper = new McpConfHelper((() => store) as unknown as StoreFactory);

    const servers = await helper.getMcpServers();

    // No throw; the helper self-heals by re-seeding built-in defaults.
    expect(Object.keys(servers).length).toBeGreaterThan(0);
    expect(set).toHaveBeenCalledWith("mcpServers", expect.any(Object));
  });
});
