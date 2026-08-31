import { describe, expect, it } from "vitest";

import { CUA_PLUGIN_ID } from "@argos/shared/types/plugin";
import {
  assertPluginManifestLifecycleContract,
  createMinimalProcessEnvironment,
  validateAndCloneJsonSchema,
} from "@argos/backend-core";
import type { ArgosPluginManifest } from "@argos/shared/types/plugin";

const baseManifest = (overrides: Partial<ArgosPluginManifest> = {}): ArgosPluginManifest =>
  ({
    id: CUA_PLUGIN_ID,
    name: "CUA",
    version: "2.0.0",
    publisher: "Argos",
    engines: { argos: ">=0", platforms: ["linux"] },
    activationEvents: ["onEnable"],
    capabilities: ["mcp.register"],
    source: { type: "argos-official", url: "https://example.invalid/x.dcplugin", publisher: "Argos" },
    runtime: {
      id: "cua-driver",
      type: "external-helper",
      displayName: "CUA Driver",
      detect: [],
      adapter: "cua-embedded-v1",
      adapterContract: {
        hostBundleId: "com.wefonk.argos.computeruse",
        driverVersion: "0.19.2",
        contractVersion: "0.6.0",
        toolsListSchemaVersion: "1",
        capabilityVersion: "1",
        mcpProtocolVersion: "2025-06-18",
      },
      integrityDescriptor: "runtime/linux/x64/integrity.json",
    },
    mcpServers: [
      {
        id: "cua-driver",
        displayName: "CUA Driver",
        transport: "stdio",
        command: "${runtime.cua-driver.command}",
        args: ["mcp", "--embedded"],
        startMode: "onDemand",
        surfaces: ["tools"],
        toolCatalog: "runtime/linux/x64/tool-catalog.json",
        inheritEnv: "minimal",
      },
    ],
    ...overrides,
  }) as ArgosPluginManifest;

describe("assertPluginManifestLifecycleContract", () => {
  it("accepts a valid embedded runtime manifest", () => {
    expect(() => assertPluginManifestLifecycleContract(baseManifest())).not.toThrow();
  });

  it("ignores manifests without a runtime", () => {
    const manifest = baseManifest();
    delete (manifest as { runtime?: unknown }).runtime;
    expect(() => assertPluginManifestLifecycleContract(manifest)).not.toThrow();
  });

  it("rejects unknown adapters and orphan contracts", () => {
    expect(() =>
      assertPluginManifestLifecycleContract(
        baseManifest({
          runtime: { ...(baseManifest().runtime as ArgosPluginManifest["runtime"]), adapter: "other-v1" as never },
        }),
      ),
    ).toThrow(/unsupported runtime adapter/);

    const manifest = baseManifest();
    const runtime = manifest.runtime as ArgosPluginManifest["runtime"];
    delete (runtime as { adapter?: unknown }).adapter;
    expect(() => assertPluginManifestLifecycleContract(manifest)).toThrow(/without an adapter/);
  });

  it("reserves the adapter for the CUA plugin", () => {
    const manifest = baseManifest({ id: "com.other.plugin" });
    expect(() => assertPluginManifestLifecycleContract(manifest)).toThrow(/reserved for/);
  });

  it("requires exactly one matching onDemand minimal-env MCP server", () => {
    const manifest = baseManifest();
    manifest.mcpServers = [
      ...(manifest.mcpServers ?? []),
      {
        id: "extra",
        displayName: "Extra",
        transport: "stdio",
        command: "x",
        args: [],
      },
    ];
    expect(() => assertPluginManifestLifecycleContract(manifest)).toThrow(/exactly one MCP server/);

    const wrongStartMode = baseManifest();
    (wrongStartMode.mcpServers![0] as { startMode?: string }).startMode = "eager";
    expect(() => assertPluginManifestLifecycleContract(wrongStartMode)).toThrow(/onDemand/);

    const wrongEnv = baseManifest();
    delete (wrongEnv.mcpServers![0] as { inheritEnv?: string }).inheritEnv;
    expect(() => assertPluginManifestLifecycleContract(wrongEnv)).toThrow(/inheritEnv "minimal"/);
  });

  it("rejects unsafe integrity descriptor paths", () => {
    const manifest = baseManifest();
    (manifest.runtime as { integrityDescriptor: string }).integrityDescriptor = "../escape.json";
    expect(() => assertPluginManifestLifecycleContract(manifest)).toThrow(/is unsafe/);
  });
});

describe("createMinimalProcessEnvironment", () => {
  it("keeps only essential variables on POSIX platforms", () => {
    const env = createMinimalProcessEnvironment(
      { PATH: "/usr/bin", HOME: "/root", DISPLAY: ":0", RANDOM_SECRET: "x", LANG: "C.UTF-8" },
      "linux",
    );
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/root", DISPLAY: ":0", LANG: "C.UTF-8" });
  });

  it("includes display variables on linux and windows essentials on win32", () => {
    expect(createMinimalProcessEnvironment({ DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0" }, "linux")).toEqual({
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
    });
    expect(createMinimalProcessEnvironment({ SYSTEMROOT: "C:\\Windows", DISPLAY: ":0" }, "win32")).toEqual({
      SYSTEMROOT: "C:\\Windows",
    });
  });
});

describe("validateAndCloneJsonSchema", () => {
  it("clones a valid schema", () => {
    const schema = { type: "object", properties: { x: { type: "number" } }, required: ["x"] };
    const cloned = validateAndCloneJsonSchema(schema, "test");
    expect(cloned).toEqual(schema);
    expect(cloned).not.toBe(schema);
  });

  it("rejects non-objects and remote references", () => {
    expect(() => validateAndCloneJsonSchema("nope", "test")).toThrow(/must be a JSON object/);
    expect(() =>
      validateAndCloneJsonSchema({ type: "object", properties: { x: { $ref: "https://evil/schema" } } }, "test"),
    ).toThrow(/remote \$ref/);
  });
});
