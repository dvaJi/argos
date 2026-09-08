import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { ToolchainService } from "../src/host/toolchains/service";
import { installToolchain, ToolchainInstallError } from "../src/host/toolchains/install";
import { pinFor } from "../src/host/toolchains/catalog";
import { systemToolPath } from "../src/host/toolchains/locate";

/**
 * Hermetic coverage for the toolchain resolver, command rewrites, and the
 * managed-install pipeline. All filesystem fixtures live under temp dirs; the
 * version probe is injected so no real binary is spawned.
 */

const EMPTY_ENV = { PATH: "", HOME: "", USERPROFILE: "", ProgramFiles: "", LOCALAPPDATA: "" } as NodeJS.ProcessEnv;
const nodeBin = () => (process.platform === "win32" ? "node.exe" : path.join("bin", "node"));
const uvBin = () => (process.platform === "win32" ? "uv.exe" : "uv");

describe("toolchain service", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const tempRoot = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-toolchains-svc-"));
    roots.push(dir);
    return dir;
  };

  const createManagedNode = (dataDir: string): string => {
    const nodePath = path.join(dataDir, "toolchains", "tools", "node", pinFor("node"), nodeBin());
    fs.mkdirSync(path.dirname(nodePath), { recursive: true });
    fs.writeFileSync(nodePath, "binary");
    return nodePath;
  };

  const createManagedUv = (dataDir: string): string => {
    const uvPath = path.join(dataDir, "toolchains", "tools", "uv", pinFor("uv"), uvBin());
    fs.mkdirSync(path.dirname(uvPath), { recursive: true });
    fs.writeFileSync(uvPath, "binary");
    return uvPath;
  };

  it("resolves a managed tree ahead of system lookups", async () => {
    const dataDir = tempRoot();
    const nodePath = createManagedNode(dataDir);
    const service = new ToolchainService({
      dataDir,
      env: EMPTY_ENV,
      probeVersion: async () => pinFor("node"),
    });

    const resolved = await service.resolve("node");
    expect(resolved.source).toBe("managed");
    expect(resolved.explicit).toBe(false);
    expect(resolved.path).toBe(nodePath);
    expect(resolved.version).toBe(pinFor("node"));
  });

  it("prefers an explicit custom path over the managed tree", async () => {
    const dataDir = tempRoot();
    createManagedNode(dataDir);
    const customBin = path.join(tempRoot(), "custom-node");
    fs.writeFileSync(customBin, "binary");

    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => "1.2.3" });
    await service.setSource("node", "custom", customBin);

    const resolved = await service.resolve("node");
    expect(resolved.source).toBe("custom");
    expect(resolved.explicit).toBe(true);
    expect(resolved.path).toBe(customBin);
    expect(resolved.version).toBe("1.2.3");
  });

  it("keeps an explicit unconfigured choice over any derived source", async () => {
    const dataDir = tempRoot();
    createManagedNode(dataDir);

    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => null });
    await service.setSource("node", "unconfigured");

    const resolved = await service.resolve("node");
    expect(resolved.source).toBe("unconfigured");
    expect(resolved.explicit).toBe(true);
    expect(resolved.path).toBeNull();

    // Reverting falls back to the derived (managed) tree.
    await service.removeSource("node");
    expect((await service.resolve("node")).source).toBe("managed");
  });

  it("rewrites npx through managed node without touching args on fallback", async () => {
    const dataDir = tempRoot();
    const nodePath = createManagedNode(dataDir);
    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => pinFor("node") });
    await service.warmup();

    const nodeDir = path.dirname(nodePath);
    const cliRelative =
      process.platform === "win32" ? "node_modules/npm/bin/npx-cli.js" : "../lib/node_modules/npm/bin/npx-cli.js";
    const cli = path.resolve(nodeDir, cliRelative);
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "// npx cli");

    const rewritten = service.resolveCommandSync("npx", ["-y", "some-agent", "--acp"]);
    expect(rewritten.command).toBe(nodePath);
    expect(rewritten.args[0]).toBe(cli);
    expect(rewritten.args.slice(1)).toEqual(["-y", "some-agent", "--acp"]);

    // Unknown commands pass through untouched.
    expect(service.resolveCommandSync("rg", ["--version"])).toEqual({ command: "rg", args: ["--version"] });
  });

  it("rewrites uvx to the uv sibling binary", async () => {
    const dataDir = tempRoot();
    const uvPath = createManagedUv(dataDir);
    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => pinFor("uv") });
    await service.warmup();

    const rewritten = service.resolveCommandSync("uvx", ["some-server"]);
    const uvDir = path.dirname(uvPath);
    const expectedUvx = path.join(uvDir, process.platform === "win32" ? "uvx.exe" : "uvx");
    fs.mkdirSync(uvDir, { recursive: true });
    fs.writeFileSync(expectedUvx, "binary");
    const afterSibling = service.resolveCommandSync("uvx", ["some-server"]);
    expect(afterSibling.command).toBe(expectedUvx);
    expect(afterSibling.args).toEqual(["some-server"]);
  });

  it("reports bin dirs from the warm cache", async () => {
    const dataDir = tempRoot();
    const uvPath = createManagedUv(dataDir);
    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => null });
    expect(service.binDirsSync()).toEqual([]);
    await service.warmup();
    expect(service.binDirsSync()).toContain(path.dirname(uvPath));
    expect(service.binDirForToolSync("uv")).toBe(path.dirname(uvPath));
  });
});

describe("managed install pipeline", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const tempRoot = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-toolchains-install-"));
    roots.push(dir);
    return dir;
  };

  const fakeArchive = (content: string) => {
    const bytes = new TextEncoder().encode(content);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      bytes,
      archive: { filename: "node-vTEST.tar.gz", url: "https://example.invalid/node.tar.gz", sha256 },
    };
  };

  it("activates a verified archive atomically and the service sees it", async () => {
    const dataDir = tempRoot();
    const { bytes, archive } = fakeArchive("payload");
    const nodeRoot = path.join(dataDir, "toolchains", "tools", "node", pinFor("node"));

    await installToolchain("node", {
      dataDir,
      fetchImpl: (async () => new Response(bytes)) as typeof fetch,
      cancelled: () => false,
      archive,
      extract: async (_archivePath, destinationDir) => {
        // Emulate an archive with one top-level dir, platform layout inside.
        const top = path.join(destinationDir, "node-vTEST");
        fs.mkdirSync(process.platform === "win32" ? top : path.join(top, "bin"), { recursive: true });
        fs.writeFileSync(path.join(top, nodeBin()), "binary");
      },
    });

    expect(fs.existsSync(nodeRoot)).toBe(true);
    expect(fs.existsSync(path.join(nodeRoot, nodeBin()))).toBe(true);

    const service = new ToolchainService({ dataDir, env: EMPTY_ENV, probeVersion: async () => pinFor("node") });
    const resolved = await service.resolve("node");
    expect(resolved.source).toBe("managed");
  });

  it("fails on checksum mismatch without touching the active tree", async () => {
    const dataDir = tempRoot();
    const { bytes } = fakeArchive("payload");
    const versionDir = path.join(dataDir, "toolchains", "tools", "node", pinFor("node"));
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, nodeBin()), "previous");

    await expect(
      installToolchain("node", {
        dataDir,
        fetchImpl: (async () => new Response(bytes)) as typeof fetch,
        cancelled: () => false,
        archive: { filename: "node-vTEST.tar.gz", url: "https://example.invalid/x", sha256: "deadbeef" },
      }),
    ).rejects.toBeInstanceOf(ToolchainInstallError);

    expect(fs.existsSync(path.join(versionDir, nodeBin()))).toBe(true);
    expect(fs.readFileSync(path.join(versionDir, nodeBin()), "utf-8")).toBe("previous");
  });

  it("cancel during download leaves nothing behind", async () => {
    const dataDir = tempRoot();
    const { bytes, archive } = fakeArchive("payload");

    await expect(
      installToolchain("node", {
        dataDir,
        fetchImpl: (async () => new Response(bytes)) as typeof fetch,
        cancelled: () => true,
        archive,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });

    expect(fs.existsSync(path.join(dataDir, "toolchains", "tools", "node", pinFor("node")))).toBe(false);
  });

  // Rollback semantics rely on Windows' mandatory locks: an open handle inside
  // the staged tree blocks its activation rename. POSIX has no equivalent, so
  // this scenario is Windows-only.
  it.skipIf(process.platform !== "win32")("keeps the previous tree active when activation is blocked", async () => {
    const dataDir = tempRoot();
    const { bytes, archive } = fakeArchive("payload");
    const versionDir = path.join(dataDir, "toolchains", "tools", "node", pinFor("node"));
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, nodeBin()), "previous");

    let lockFd: number | null = null;
    try {
      await expect(
        installToolchain("node", {
          dataDir,
          fetchImpl: (async () => new Response(bytes)) as typeof fetch,
          cancelled: () => false,
          archive,
          extract: async (_archivePath, destinationDir) => {
            fs.mkdirSync(destinationDir, { recursive: true });
            fs.writeFileSync(path.join(destinationDir, nodeBin()), "next");
            // Hold a handle inside the staged tree so the activation rename
            // fails and the rollback path must fire.
            lockFd = fs.openSync(path.join(destinationDir, nodeBin()), "r+");
          },
        }),
      ).rejects.toBeInstanceOf(ToolchainInstallError);
    } finally {
      if (lockFd != null) fs.closeSync(lockFd);
    }

    // The previous content is still active.
    expect(fs.existsSync(path.join(versionDir, nodeBin()))).toBe(true);
    expect(fs.readFileSync(path.join(versionDir, nodeBin()), "utf-8")).toBe("previous");
  });
});

describe("system detection", () => {
  it("finds binaries from injected PATH entries before defaults", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-toolchains-sys-"));
    const uvName = process.platform === "win32" ? "uv.exe" : "uv";
    fs.writeFileSync(path.join(dir, uvName), "binary");
    const found = systemToolPath("uv", { PATH: dir } as NodeJS.ProcessEnv);
    expect(found).toBe(path.join(dir, uvName));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
