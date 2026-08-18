import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";

describe("DaemonSkillRuntime", () => {
  const cleanupRoots: string[] = [];

  afterEach(() => {
    while (cleanupRoots.length > 0) {
      const root = cleanupRoots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  function createSkillFixture(root: string): string {
    const skillsDir = path.join(root, "skills");
    fs.mkdirSync(path.join(skillsDir, "test-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "test-skill", "SKILL.md"),
      `---\ndescription: Test skill\n---\n# Test skill\n`,
    );
    return skillsDir;
  }

  function createRuntimeDeps(root: string, skillsDir: string) {
    const sessionRepository = {
      get: async (sessionId: string) => (sessionId === "conv-1" ? { id: sessionId } : null),
    };

    return {
      dataDir: path.join(root, "data"),
      appVersion: "1.0.0",
      eventPublisher: {
        publish: () => {},
      },
      configPresenter: {
        getSkillsPath: () => skillsDir,
      },
      sessionRepository,
    };
  }

  it("persists active skills across daemon runtime instances", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-skill-"));
    cleanupRoots.push(root);

    const skillsDir = createSkillFixture(root);
    const deps = createRuntimeDeps(root, skillsDir);
    const { DaemonSkillRuntime } = await import("../src/host/daemonSkillRuntime");

    const firstRuntime = new DaemonSkillRuntime(deps as never);
    expect(await firstRuntime.presenter.getActiveSkills("conv-1")).toEqual([]);

    await expect(firstRuntime.presenter.setActiveSkills("conv-1", ["test-skill"])).resolves.toEqual(["test-skill"]);

    const secondRuntime = new DaemonSkillRuntime(deps as never);
    await expect(secondRuntime.presenter.getActiveSkills("conv-1")).resolves.toEqual(["test-skill"]);
  });

  it("discovers skills through the daemon inline discovery path", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-skill-"));
    cleanupRoots.push(root);

    const skillsDir = createSkillFixture(root);
    const deps = createRuntimeDeps(root, skillsDir);
    const { DaemonSkillRuntime } = await import("../src/host/daemonSkillRuntime");

    const runtime = new DaemonSkillRuntime(deps as never);
    await expect(runtime.presenter.getMetadataList()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "test-skill",
          description: "Test skill",
          path: path.join(skillsDir, "test-skill", "SKILL.md"),
        }),
      ]),
    );
  });

  it("does not report skills for missing sessions", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-skill-"));
    cleanupRoots.push(root);

    const skillsDir = createSkillFixture(root);
    const deps = createRuntimeDeps(root, skillsDir);
    const { DaemonSkillRuntime } = await import("../src/host/daemonSkillRuntime");

    const runtime = new DaemonSkillRuntime({
      ...deps,
      sessionRepository: {
        get: async () => null,
      },
    } as never);

    await expect(runtime.presenter.getActiveSkills("missing-conv")).resolves.toEqual([]);
  });
});
