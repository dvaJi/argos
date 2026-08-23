import { describe, expect, it } from "vitest";
import { summarizeFileChangesFromBlocks } from "../src/host/acpFileChanges";

const WORKDIR = "/home/user/project";

describe("summarizeFileChangesFromBlocks", () => {
  it("returns no files when there are no tool_call blocks", () => {
    const summary = summarizeFileChangesFromBlocks(
      [{ type: "content", content: "hi", status: "success" } as any],
      WORKDIR,
    );
    expect(summary.files).toEqual([]);
  });

  it("ignores non-successful tool calls", () => {
    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "error",
          tool_call: { name: "write", params: "{}" },
          raw_contents: [{ type: "diff", path: "/home/user/project/src/a.ts", oldText: "", newText: "const a = 1;" }],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([]);
  });

  it("extracts v1 diffs with oldText/newText and relativizes absolute paths", () => {
    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "write", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              path: "/home/user/project/src/wavespeed.rs",
              oldText: "fn main() {\n}",
              newText: "fn main() {\n  run();\n}\n",
            },
          ],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([{ path: "src/wavespeed.rs", additions: 2, deletions: 0 }]);
  });

  it("counts deletions from v1 diffs", () => {
    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "edit", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              path: "/home/user/project/README.md",
              oldText: "old line 1\nold line 2\nold line 3",
              newText: "new line 1",
            },
          ],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([{ path: "README.md", additions: 1, deletions: 3 }]);
  });

  it("parses v2 structured changes with a git patch for accurate counts", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 0000000..1111111 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -0,0 +1,2 @@",
      "+line1",
      "+line2",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1,3 +1,1 @@",
      "-old1",
      "-old2",
      "-old3",
      "+new1",
    ].join("\n");

    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "batch", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              changes: [{ operation: "add", path: "/home/user/project/src/a.ts" }],
              patch: { format: "git_patch", text: patch },
            },
            {
              type: "diff",
              changes: [{ operation: "modify", path: "/home/user/project/src/b.ts" }],
              patch: { format: "git_patch", text: patch },
            },
          ],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([
      { path: "src/a.ts", additions: 2, deletions: 0 },
      { path: "src/b.ts", additions: 1, deletions: 3 },
    ]);
  });

  it("emits null stats when only structured changes exist (no patch text)", () => {
    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "write", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              changes: [{ operation: "delete", path: "/home/user/project/old.ts" }],
              patch: null,
            },
          ],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([{ path: "old.ts", additions: null, deletions: null }]);
  });

  it("merges multiple diffs for the same file", () => {
    const summary = summarizeFileChangesFromBlocks(
      [
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "edit", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              path: "/home/user/project/app.ts",
              oldText: "a\n",
              newText: "a\nb\n",
            },
          ],
        } as any,
        {
          type: "tool_call",
          status: "success",
          tool_call: { name: "edit", params: "{}" },
          raw_contents: [
            {
              type: "diff",
              path: "/home/user/project/app.ts",
              oldText: "a\nb\n",
              newText: "a\nb\nc\n",
            },
          ],
        } as any,
      ],
      WORKDIR,
    );
    expect(summary.files).toEqual([{ path: "app.ts", additions: 2, deletions: 0 }]);
  });
});
