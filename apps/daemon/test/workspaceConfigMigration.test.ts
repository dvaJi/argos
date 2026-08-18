import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

  test("preserves verified machine metadata across configuration reads", () => {
    const config = {
      schemaVersion: 2,
      activeWorkspaceId: "remote",
      workspaces: [
        { id: "local", name: "This computer", mode: "local", remoteUrl: "", createdAt: 0 },
        {
          id: "remote",
          name: "Build host",
          mode: "remote",
          remoteUrl: "https://build.example.test",
          createdAt: 1,
          credentialRef: "machine-ref",
          environmentId: "environment-1",
          lastKnownServerVersion: "0.2.0",
          lastKnownProtocolVersion: 1,
          lastKnownCapabilities: ["chat", "sessions"],
          lastConnectedAt: 123,
        },
      ],
    };

    localStorage.setItem(WORKSPACE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    expect(readWorkspaceConfig().workspaces[1]).toMatchObject({
      lastKnownProtocolVersion: 1,
      lastKnownCapabilities: ["chat", "sessions"],
      lastConnectedAt: 123,
    });
  });

  test("persists an opaque credential reference without a bearer secret", () => {
    const bearer = "argos-secret-bearer-value";
    writeWorkspaceConfig({
      schemaVersion: 2,
      activeWorkspaceId: "remote",
      workspaces: [
        {
          id: "remote",
          name: "Build host",
          mode: "remote",
          remoteUrl: "https://build.example.test",
          credentialRef: "machine-opaque-reference",
          environmentId: "environment-1",
          trustState: "paired",
          createdAt: 123,
        },
      ],
    });

    const persisted = storage.get(WORKSPACE_CONFIG_STORAGE_KEY) ?? "";
    expect(persisted).toContain("machine-opaque-reference");
    expect(persisted).not.toContain(bearer);
    expect(persisted).not.toMatch(/(?:token|bearer|authorization|password)\s*[:=]\s*["'][^"']+/i);
  });
});
