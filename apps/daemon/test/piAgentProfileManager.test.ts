import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PiAgentProfileManager } from "../src/host/piAgentProfileManager";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function createManager() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "argos-pi-profile-"));
  directories.push(directory);
  return new PiAgentProfileManager(directory, "1.2.3");
}

describe("PiAgentProfileManager", () => {
  it("creates an isolated Pi profile with package resource directories", () => {
    const manager = createManager();
    const profile = manager.ensureProfile("research-agent");

    expect(profile).toContain(path.join("agents", "research-agent", "pi"));
    for (const child of ["extensions", "skills", "prompts", "npm", "git", "sessions"]) {
      expect(fs.statSync(path.join(profile, child)).isDirectory()).toBe(true);
    }
    expect(manager.readSettings("research-agent").packages).toEqual(["@ff-labs/pi-fff"]);
  });

  it("manages packages independently for each agent", () => {
    const manager = createManager();
    manager.installPackage("one", "pi-one");
    manager.installPackage("one", { source: "pi-two", skills: ["skills"] });
    manager.installPackage("two", "pi-other");

    expect(manager.listPackages("one")).toEqual([
      "@ff-labs/pi-fff",
      "pi-one",
      { source: "pi-two", skills: ["skills"] },
    ]);
    expect(manager.listPackages("two")).toEqual(["@ff-labs/pi-fff", "pi-other"]);
    expect(manager.removePackage("one", "pi-one")).toEqual([
      "@ff-labs/pi-fff",
      { source: "pi-two", skills: ["skills"] },
    ]);
  });

  it("applies FFF once and permits a user to remove it", () => {
    const manager = createManager();
    expect(manager.removePackage("one", "@ff-labs/pi-fff")).toEqual([]);
    expect(manager.listPackages("one")).toEqual([]);
  });

  it("requires explicit project trust and stores normalized paths", () => {
    const manager = createManager();
    const project = path.join("some", "project", "..");

    expect(manager.isProjectTrusted("agent", project)).toBe(false);
    expect(manager.setProjectTrusted("agent", project, true)).toBe(true);
    expect(manager.isProjectTrusted("agent", path.resolve(project))).toBe(true);
    expect(manager.setProjectTrusted("agent", project, false)).toBe(false);
  });

  it("rejects agent ids that cannot form a safe profile name", () => {
    const manager = createManager();
    expect(() => manager.ensureProfile("///")).toThrow("valid agent id");
  });

  it("persists managed skills in .argos with a hash registry and Pi location", () => {
    const manager = createManager();
    const first = manager.writeManagedSkill("mail-agent", {
      name: "zoho-mail",
      description: "Use Zoho Mail through its MCP server.",
      instructions: "Use the Zoho MCP tools for inbox and message operations.",
    });

    expect(first).toMatchObject({ name: "zoho-mail", managedVersion: "1.2.3" });
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      fs.readFileSync(path.join(manager.getManagedSkillsDir("mail-agent"), "zoho-mail", "SKILL.md"), "utf8"),
    ).toContain("name: zoho-mail");
    expect(manager.readSettings("mail-agent").skills).toContain(manager.getManagedSkillsDir("mail-agent"));
    expect(manager.listManagedSkills("mail-agent")).toEqual([first]);
    expect(manager.validateManagedSkills("mail-agent")).toEqual([{ ...first, exists: true, hashMatches: true }]);
    fs.appendFileSync(path.join(manager.getManagedSkillsDir("mail-agent"), "zoho-mail", "SKILL.md"), "tampered");
    expect(manager.validateManagedSkills("mail-agent")[0]?.hashMatches).toBe(false);

    const updated = manager.writeManagedSkill("mail-agent", {
      name: "zoho-mail",
      description: "Use Zoho Mail safely.",
      instructions: "Never place credentials in messages.",
    });
    expect(updated.installedAt).toBe(first.installedAt);
    expect(updated.sha256).not.toBe(first.sha256);
    expect(manager.removeManagedSkill("mail-agent", "zoho-mail")).toBe(true);
    expect(manager.listManagedSkills("mail-agent")).toEqual([]);
    expect(manager.removeProfile("mail-agent")).toBe(true);
  });

  it("rejects unsafe managed skill names", () => {
    const manager = createManager();
    expect(() =>
      manager.writeManagedSkill("mail-agent", {
        name: "../escape",
        description: "unsafe",
        instructions: "unsafe",
      }),
    ).toThrow("Skill names must be");
  });
});
