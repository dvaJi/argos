import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "bun:test";
import { AcpLaunchSpecService } from "@argos/acp-runtime";

/**
 * Real-fs tests for the Windows locked-binary swap path in
 * AcpLaunchSpecService. These cannot live in the desktop main suite because
 * its global setup mocks node:fs.
 */
describe("AcpLaunchSpecService locked-dir swap (win32)", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  const createService = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-lock-"));
    roots.push(dir);
    return { service: new AcpLaunchSpecService(dir), dir };
  };

  const platformKey = `${({ darwin: "darwin", linux: "linux", win32: "windows" } as Record<string, string>)[process.platform]}-${
    ({ arm64: "aarch64", x64: "x86_64" } as Record<string, string>)[process.arch]
  }`;

  const binaryAgent = {
    id: "opencode",
    name: "OpenCode",
    version: "1.18.18",
    distribution: {
      binary: {
        [platformKey]: {
          archive: "https://example.com/opencode.zip",
          cmd: "opencode.exe",
        },
      },
    },
    source: "registry" as const,
    enabled: true,
  };

  const seedInstallDir = (dir: string, content = "binary-v1"): string => {
    const installDir = path.join(dir, "agents", binaryAgent.id, binaryAgent.version);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "opencode.exe"), content);
    return installDir;
  };

  const staleDirs = (dir: string): string[] =>
    fs.readdirSync(path.join(dir, "agents", binaryAgent.id)).filter((entry) => entry.includes(".old-"));

  const lockRmSync = (installDir: string, options?: { onlyFirst?: boolean }) => {
    let installDirRmCalls = 0;
    const original = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation(((target: any, args?: any) => {
      const targetPath = String(target);
      if (targetPath === installDir) {
        installDirRmCalls += 1;
        if (!options?.onlyFirst || installDirRmCalls === 1) {
          throw Object.assign(new Error(`EACCES: permission denied, rm '${targetPath}'`), { code: "EACCES" });
        }
      } else if (targetPath.includes(".old-")) {
        // The swapped-aside dir stays locked while the process is running.
        throw Object.assign(new Error(`EACCES: permission denied, rm '${targetPath}'`), { code: "EACCES" });
      }
      return original.call(fs, target, args);
    }) as any);
  };

  // bun:test has no it.runIf — it.if runs the test only when the condition is true.
  it.if(process.platform === "win32")(
    "swaps a locked install dir aside when repairing a running binary agent",
    async () => {
      const { service, dir } = createService();
      const installDir = seedInstallDir(dir);
      lockRmSync(installDir);

      (service as any).downloadArchive = vi.fn(async () => path.join(dir, "fake-archive.zip"));
      (service as any).extractArchive = vi.fn(async (_archivePath: string, targetDir: string) => {
        fs.writeFileSync(path.join(targetDir, "opencode.exe"), "binary-v2");
      });

      const state = await service.ensureRegistryAgentInstalled(binaryAgent, null, { repair: true });

      expect(state.status).toBe("installed");
      expect(state.installDir).toBe(installDir);
      expect(fs.readFileSync(path.join(installDir, "opencode.exe"), "utf-8")).toBe("binary-v2");

      // The old version dir was swapped aside instead of deleted, and the sweep
      // left it in place because it is still locked by the running process.
      expect(staleDirs(dir)).toHaveLength(1);
    },
  );

  // bun:test has no it.runIf — it.if runs the test only when the condition is true.
  it.if(process.platform === "win32")("restores the swapped install dir when the fresh install fails", async () => {
    const { service, dir } = createService();
    const installDir = seedInstallDir(dir);
    // Only the first rm attempt (swapping the locked dir aside) fails; the
    // partial install dir cleanup during restore succeeds.
    lockRmSync(installDir, { onlyFirst: true });

    (service as any).downloadArchive = vi.fn(async () => path.join(dir, "fake-archive.zip"));
    (service as any).extractArchive = vi.fn(async () => {
      throw new Error("extract exploded");
    });

    const state = await service.ensureRegistryAgentInstalled(binaryAgent, null, { repair: true });

    expect(state.status).toBe("error");
    expect(state.error).toContain("extract exploded");

    // The previous version was restored to the canonical install dir so the
    // agent keeps working until the next launch re-installs it.
    expect(fs.readFileSync(path.join(installDir, "opencode.exe"), "utf-8")).toBe("binary-v1");
    expect(staleDirs(dir)).toHaveLength(0);
  });

  it("sweeps stale .old- install dirs on the launch-time ensure path", async () => {
    const { service, dir } = createService();
    const installDir = seedInstallDir(dir);
    const staleDir = `${installDir}.old-1234567890`;
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, "opencode.exe"), "binary-v0");

    // No repair: the binary is already present, so the ensure short-circuits
    // and the sweep removes the stale swapped-aside dir.
    const state = await service.ensureRegistryAgentInstalled(binaryAgent, null);

    expect(state.status).toBe("installed");
    expect(fs.existsSync(installDir)).toBe(true);
    expect(fs.existsSync(staleDir)).toBe(false);
  });

  it("sweeps stale .old- install dirs during uninstall", async () => {
    const { service, dir } = createService();
    const installDir = seedInstallDir(dir);
    const staleDir = `${installDir}.old-1234567890`;
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, "opencode.exe"), "binary-v0");

    await service.uninstallRegistryAgent(binaryAgent, {
      status: "installed",
      distributionType: "binary",
      version: binaryAgent.version,
      installDir,
    });

    expect(fs.existsSync(installDir)).toBe(false);
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(path.join(dir, "agents", binaryAgent.id))).toBe(false);
  });
});
