import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { WORKSPACE_CONFIG_STORAGE_KEY, readWorkspaceConfig, writeWorkspaceConfig } from "@argos/shared/workspaceConfig";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("workspace config migration", () => {
  test("preserves legacy metadata while requiring a new secure pairing", () => {
    storage.set(
      WORKSPACE_CONFIG_STORAGE_KEY,
      JSON.stringify({
        workspaces: [
          { id: "local", name: "Local", mode: "local", remoteUrl: "", createdAt: 0 },
          {
            id: "legacy-remote",
            name: "Build host",
            mode: "remote",
            remoteUrl: "https://build.example.test",
            createdAt: 123,
          },
        ],
        activeWorkspaceId: "legacy-remote",
      }),
    );

    const config = readWorkspaceConfig();
    expect(config.schemaVersion).toBe(2);
    expect(config.activeWorkspaceId).toBe("legacy-remote");
    expect(config.workspaces[1]).toMatchObject({
      id: "legacy-remote",
      name: "Build host",
      remoteUrl: "https://build.example.test",
      createdAt: 123,
      trustState: "pairing-required",
    });

    writeWorkspaceConfig(config);
    expect(storage.get(WORKSPACE_CONFIG_STORAGE_KEY)).not.toContain("sessionToken");
  });
});
