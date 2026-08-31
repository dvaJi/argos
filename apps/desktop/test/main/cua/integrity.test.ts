import { mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CUA_PLUGIN_ID } from "@argos/shared/types/plugin";
import { CuaRuntimeIntegrityVerifier, parseCuaRuntimeIntegrityDescriptor } from "@argos/backend-core";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

async function stageRuntime(options: { binaryContent?: string; catalogContent?: string; binaryMode?: number } = {}) {
  const pluginRoot = await mkdtemp();
  const runtimeRoot = path.join(pluginRoot, "runtime", "linux", "x64");
  await mkdir(runtimeRoot, { recursive: true });
  const binaryContent = options.binaryContent ?? "#!/bin/sh\necho cua-driver\n";
  const catalogContent = options.catalogContent ?? '{"version":"0.19.2","tools":[]}';
  const binaryPath = path.join(runtimeRoot, "cua-driver");
  await writeFile(binaryPath, binaryContent);
  await chmod(binaryPath, options.binaryMode ?? 0o755);
  const catalogPath = path.join(runtimeRoot, "tool-catalog.json");
  await writeFile(catalogPath, catalogContent);
  return {
    pluginRoot,
    runtimeRoot,
    binaryPath,
    catalogPath,
    descriptor: parseCuaRuntimeIntegrityDescriptor({
      schemaVersion: 1,
      pluginId: CUA_PLUGIN_ID,
      runtimeId: "cua-driver",
      runtimeVersion: "0.19.2",
      target: "linux/x64",
      runtimeRoot: "runtime/linux/x64",
      binaryPath: "cua-driver",
      catalogPath: "tool-catalog.json",
      files: {
        "cua-driver": sha256(binaryContent),
        "tool-catalog.json": sha256(catalogContent),
      },
      executablePaths: ["cua-driver"],
    }),
  };
}

async function mkdtemp() {
  const root = await mkdtempRaw();
  tempRoots.push(root);
  return root;
}

function mkdtempRaw() {
  return fsMkdtemp(path.join(os.tmpdir(), "argos-cua-integrity-"));
}

import { mkdtemp as fsMkdtemp } from "node:fs/promises";

describe("CuaRuntimeIntegrityVerifier", () => {
  it("verifies an intact runtime and returns a fingerprint", async () => {
    const { pluginRoot, binaryPath, catalogPath, descriptor } = await stageRuntime();
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    const fingerprint = await verifier.verify();

    expect(fingerprint).toMatchObject({
      pluginId: CUA_PLUGIN_ID,
      runtimeId: "cua-driver",
      target: "linux/x64",
      binarySha256: sha256("#!/bin/sh\necho cua-driver\n"),
    });
    expect(fingerprint.value).toBeTypeOf("string");
    expect(await verifier.verifyCatalog(catalogPath)).toBe('{"version":"0.19.2","tools":[]}');
  });

  it("rejects binaries outside the registered launch roots", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath: "/elsewhere/cua-driver",
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    await expect(verifier.verify()).rejects.toThrow(/outside its registered launch roots/);
  });

  it("detects hash mismatches", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    await writeFile(binaryPath, "tampered");
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    await expect(verifier.verify()).rejects.toThrow(/integrity mismatch for cua-driver/);
  });

  it("enforces the executable-bit contract", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    await chmod(binaryPath, 0o644);
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    await expect(verifier.verify()).rejects.toThrow(/declared executable is not executable/);
  });

  it("detects an unexpected extra executable", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    const extra = path.join(path.dirname(binaryPath), "extra.sh");
    await writeFile(extra, "#!/bin/sh\n");
    await chmod(extra, 0o755);
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    await expect(verifier.verify()).rejects.toThrow(/file set mismatch|unexpected executable/);
  });

  it("rejects catalog paths outside the integrity contract", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "0.19.2",
      descriptor,
    });

    await expect(verifier.verifyCatalog(path.join(pluginRoot, "other-catalog.json"))).rejects.toThrow(
      /outside its integrity contract/,
    );
  });

  it("rejects descriptor identity mismatches", async () => {
    const { pluginRoot, binaryPath, descriptor } = await stageRuntime();
    const verifier = new CuaRuntimeIntegrityVerifier({
      pluginRoot,
      binaryPath,
      platform: "linux",
      arch: "x64",
      runtimeVersion: "9.9.9",
      descriptor,
    });

    await expect(verifier.verify()).rejects.toThrow(/version mismatch/);
  });
});
