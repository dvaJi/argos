import { describe, expect, it } from "vitest";
import { describePermissionArgs } from "./permissionArgsView";

describe("describePermissionArgs", () => {
  it("shows a shell command with real newlines", () => {
    const command = "cat <<'EOF' > a.rs\nfn main() {}\nEOF";
    const view = describePermissionArgs("bash", JSON.stringify({ command }));
    expect(view.summary).toBe("Run a 3-line command");
    expect(view.sections[0]).toEqual({ label: "Command", code: command });
  });

  it("shows a write as path and content", () => {
    const view = describePermissionArgs("write", JSON.stringify({ path: "src/a.rs", content: "a\nb" }));
    expect(view.summary).toBe("Write src/a.rs (2 lines)");
    expect(view.sections).toEqual([{ label: "Content", code: "a\nb" }]);
  });

  it("shows edits as replace/with pairs", () => {
    const view = describePermissionArgs(
      "edit",
      JSON.stringify({ path: "a.ts", edits: [{ oldText: "x", newText: "y" }] }),
    );
    expect(view.summary).toBe("Edit a.ts (1 change)");
    expect(view.sections).toEqual([
      { label: "Replace", code: "x" },
      { label: "With", code: "y" },
    ]);
  });

  it("falls back to pretty JSON or raw text", () => {
    expect(describePermissionArgs("mcp_tool", '{"a":1}').sections[0]?.code).toBe('{\n  "a": 1\n}');
    expect(describePermissionArgs("x", "not json").sections[0]?.code).toBe("not json");
    expect(describePermissionArgs("x", "").sections).toEqual([]);
  });
});
