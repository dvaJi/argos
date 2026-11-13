import { describe, expect, it } from "vitest";
import {
  isValidProjectIcon,
  presentPickerProjects,
  projectAutoColor,
  projectInitials,
  resolveProjectIdentity,
  type ProjectCheckout,
  type ProjectSettings,
} from "./projectIdentity";

function settings(path: string, overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    key: path.replace(/\\/g, "/").toLowerCase(),
    path,
    name: null,
    icon: null,
    pinnedAt: null,
    archivedAt: null,
    defaultModel: null,
    defaultWorkspace: null,
    updatedAt: 1,
    ...overrides,
  };
}

const byKey = (...list: ProjectSettings[]) => Object.fromEntries(list.map((entry) => [entry.key, entry]));

describe("resolveProjectIdentity", () => {
  it("returns null without a project dir", () => {
    expect(resolveProjectIdentity(null, {}, {})).toBeNull();
    expect(resolveProjectIdentity("  ", {}, {})).toBeNull();
  });

  it("uses the folder name automatically", () => {
    expect(resolveProjectIdentity("C:\\code\\bank-ledger\\", {}, {})).toMatchObject({
      key: "c:/code/bank-ledger",
      name: "bank-ledger",
      icon: null,
    });
  });

  it("folds a linked worktree into its repository and applies its settings", () => {
    const checkout: ProjectCheckout = {
      path: "C:\\Users\\me\\.argos-daemon\\worktrees\\argos-1a2b",
      repoRoot: "C:\\code\\Infera",
      isLinkedWorktree: true,
      branch: "argos/1a2b",
    };
    const identity = resolveProjectIdentity(
      checkout.path,
      { "c:/users/me/.argos-daemon/worktrees/argos-1a2b": checkout },
      byKey(settings("C:\\code\\Infera", { name: "infera", icon: { kind: "icon", value: "lucide:rocket" } })),
    );
    expect(identity).toMatchObject({ key: "c:/code/infera", name: "infera", icon: { value: "lucide:rocket" } });
  });

  it("keeps a main-checkout subfolder as its own project", () => {
    const checkout: ProjectCheckout = { path: "/r/src", repoRoot: "/r", isLinkedWorktree: false, branch: "main" };
    expect(resolveProjectIdentity("/r/src", { "/r/src": checkout }, {})?.path).toBe("/r/src");
  });

  it("ignores icons outside the curated list or non-image data", () => {
    expect(isValidProjectIcon({ kind: "icon", value: "lucide:rocket" })).toBe(true);
    expect(isValidProjectIcon({ kind: "icon", value: "mdi:evil" })).toBe(false);
    expect(isValidProjectIcon({ kind: "image", value: "data:image/png;base64,AAA" })).toBe(true);
    expect(isValidProjectIcon({ kind: "image", value: "javascript:alert(1)" })).toBe(false);
  });
});

describe("presentPickerProjects", () => {
  const projects = [
    { name: "a", path: "/a", icon: null },
    { name: "b", path: "/b", icon: null },
    { name: "c", path: "/c", icon: null },
  ];

  it("hides archived, lists pinned first, and applies names", () => {
    const result = presentPickerProjects(
      projects,
      byKey(settings("/a", { archivedAt: 1 }), settings("/c", { pinnedAt: 1, name: "Charlie" })),
      [],
    );
    expect(result.map((project) => project.name)).toEqual(["Charlie", "b"]);
  });

  it("never hides the current or default selection", () => {
    const result = presentPickerProjects(projects, byKey(settings("/a", { archivedAt: 1 })), ["/a"]);
    expect(result.map((project) => project.path)).toEqual(["/a", "/b", "/c"]);
  });
});

describe("automatic icon", () => {
  it("derives initials and a stable color", () => {
    expect(projectInitials("bankledger")).toBe("BA");
    expect(projectInitials("bank-ledger")).toBe("BL");
    expect(projectInitials("BankLedger")).toBe("BL");
    expect(projectAutoColor("infera")).toBe(projectAutoColor("infera"));
  });
});
