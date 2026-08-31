import { EventEmitter, type ChildProcess } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => await vi.importActual("node:fs"));

import { CUA_PLUGIN_ID } from "@argos/shared/types/plugin";
import {
  CuaEmbeddedRuntimeAdapter,
  CuaDaemonCompatibilityError,
  CuaDaemonHandshakeUnavailableError,
  createCuaEmbeddedEndpoint,
  requestCuaDaemonMetadata,
  validateCuaDaemonMetadata,
} from "@argos/backend-core";
import type { CuaEmbeddedRuntimeContract } from "@argos/shared/types/plugin";

const contract: CuaEmbeddedRuntimeContract = {
  hostBundleId: "com.wefonk.argos.computeruse",
  driverVersion: "0.19.2",
  contractVersion: "0.6.0",
  toolsListSchemaVersion: "1",
  capabilityVersion: "1",
  mcpProtocolVersion: "2025-06-18",
};

const metadata = (pid: number) => ({
  driver_version: "0.19.2",
  contract_version: "0.6.0",
  tools_list_schema_version: "1",
  capability_version: "1",
  mcp_protocol_version: "2025-06-18",
  pid,
  embedded: true,
  host_bundle_id: "com.wefonk.argos.computeruse",
});

class FakeChild extends EventEmitter {
  pid = 4242;
  exitCode: number | null = null;
  signalCode: number | null = null;
  stdin = { end: () => {}, on: () => {} };
  stderr = new EventEmitter();
  killed = false;
  kill() {
    this.killed = true;
    return true;
  }
}

describe("createCuaEmbeddedEndpoint", () => {
  it("creates managed namespace endpoints", () => {
    const unix = createCuaEmbeddedEndpoint("linux", "0123456789abcdef-0000", 1234, "/tmp");
    expect(unix).toMatch(/^\/tmp\/argos-cua-1234-[a-f0-9]{12}\.sock$/);
    const win = createCuaEmbeddedEndpoint("win32", "0123456789abcdef-0000", 1234);
    expect(win).toBe("\\\\.\\pipe\\argos-cua-1234-0123456789ab");
  });
});

describe("validateCuaDaemonMetadata", () => {
  it("accepts matching metadata and rejects mismatches", () => {
    expect(() => validateCuaDaemonMetadata(metadata(7), 7, contract)).not.toThrow();
    expect(() => validateCuaDaemonMetadata(metadata(8), 7, contract)).toThrow(CuaDaemonCompatibilityError);
    expect(() => validateCuaDaemonMetadata({ ...metadata(7), host_bundle_id: "other" }, 7, contract)).toThrow(
      CuaDaemonCompatibilityError,
    );
  });
});

describe("CuaEmbeddedRuntimeAdapter", () => {
  const makeAdapter = () => {
    let spawned = 0;
    const children: FakeChild[] = [];
    return {
      children,
      get spawnCount() {
        return spawned;
      },
      make: (overrides: Partial<Record<string, unknown>> = {}) =>
        new CuaEmbeddedRuntimeAdapter(
          {
            binaryPath: "/opt/cua-driver",
            platform: "linux",
            contract,
            environment: { ARGOS_PLUGIN_ID: CUA_PLUGIN_ID },
          },
          {
            spawnProcess: (() => {
              spawned += 1;
              const child = new FakeChild();
              children.push(child);
              return child as unknown as ChildProcess;
            }) as never,
            requestMetadata: async () => metadata(4242),
            createEndpoint: () => "/tmp/argos-cua-1234-0123456789ab.sock",
            captureEndpointIdentity: () => ({ device: 1n, inode: 2n }),
            cleanupEndpoint: () => {},
            terminateProcess: async () => true,
            terminateStaleProcess: async () => true,
            delay: async () => {},
            ...overrides,
          } as never,
        ),
    };
  };

  it("rejects environments other than the single plugin marker", () => {
    expect(
      () =>
        new CuaEmbeddedRuntimeAdapter({
          binaryPath: "/x",
          platform: "linux",
          contract,
          environment: { ARGOS_PLUGIN_ID: CUA_PLUGIN_ID, EXTRA: "1" },
        }),
    ).toThrow(/must contain exactly/);
  });

  it("starts a daemon, validates the handshake, and returns a proxy configuration", async () => {
    const fixture = makeAdapter();
    const adapter = fixture.make();

    const result = await adapter.start("tool");

    expect(fixture.spawnCount).toBe(1);
    expect(result.configOverride).toMatchObject({
      command: "/opt/cua-driver",
      args: [
        "mcp",
        "--embedded",
        "--socket",
        "/tmp/argos-cua-1234-0123456789ab.sock",
        "--host-bundle-id",
        "com.wefonk.argos.computeruse",
      ],
      inheritEnv: "minimal",
    });
    expect(result.configOverride?.env).toEqual({ ARGOS_PLUGIN_ID: CUA_PLUGIN_ID });
  });

  it("reuses a healthy running daemon without respawning", async () => {
    const fixture = makeAdapter();
    const adapter = fixture.make();

    await adapter.start("tool");
    const second = await adapter.start("tool");

    expect(fixture.spawnCount).toBe(1);
    expect(second.configOverride?.args?.[3]).toBe("/tmp/argos-cua-1234-0123456789ab.sock");
  });

  it("cleans up a daemon that exits before readiness", async () => {
    let requestCount = 0;
    const fixture = makeAdapter();
    const adapter = fixture.make({
      requestMetadata: async () => {
        requestCount += 1;
        if (requestCount >= 1) {
          const child = fixture.children[0];
          child.exitCode = 1;
        }
        throw new CuaDaemonHandshakeUnavailableError("unavailable");
      },
    });

    await expect(adapter.start("tool")).rejects.toThrow(/exited before readiness/);
  });

  it("refuses launch contexts outside the managed namespace during stale recovery", async () => {
    const fixture = makeAdapter();
    const adapter = fixture.make();

    await expect(adapter.recoverStaleLaunch({ endpoint: "/tmp/not-managed.sock", daemonPid: "9" })).rejects.toThrow(
      /outside the managed namespace/,
    );
  });
});

describe("requestCuaDaemonMetadata", () => {
  it("surfaces connection failures as handshake-unavailable errors", async () => {
    await expect(requestCuaDaemonMetadata("/nonexistent/argos-cua-test.sock", 30)).rejects.toThrow(
      /Unable to connect to CUA embedded endpoint/,
    );
  });
});
