import { describe, expect, it } from "vitest";
import { collapseFoldBlocks } from "./MessageTurnFold.shared";

// Minimal block stubs — collapseFoldBlocks only reads type, tool_call and
// content, so tests construct just enough shape to satisfy the runtime.
type BlockStub = Record<string, unknown>;

const toolCall = (name: string): BlockStub => ({ type: "tool_call", tool_call: { name } });
const reasoning = (content: string): BlockStub => ({ type: "reasoning_content", content });
const narrative = (content: string): BlockStub => ({ type: "content", content });
const plan = (): BlockStub => ({ type: "plan" });

describe("collapseFoldBlocks", () => {
  it("gives every tool call its own row instead of merging the run", () => {
    const items = collapseFoldBlocks([toolCall("read"), toolCall("bash"), toolCall("edit")] as never);
    const activity = items.filter((item) => item.kind === "activity");
    expect(activity).toHaveLength(3);
    expect(activity.every((item) => item.kind === "activity" && item.blocks.length === 1)).toBe(true);
  });

  it("merges consecutive reasoning blocks into a single thought row", () => {
    const items = collapseFoldBlocks([reasoning("a"), reasoning("b"), reasoning("c")] as never);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "activity",
      blocks: [reasoning("a"), reasoning("b"), reasoning("c")],
    });
  });

  it("starts a new thought row after an action boundary", () => {
    const items = collapseFoldBlocks([reasoning("a"), toolCall("bash"), reasoning("b")] as never);
    expect(items).toMatchObject([
      { kind: "activity", blocks: [reasoning("a")] },
      { kind: "activity", blocks: [toolCall("bash")] },
      { kind: "activity", blocks: [reasoning("b")] },
    ]);
  });

  it("keeps narrative blocks as their own rows and splits the work stream", () => {
    const items = collapseFoldBlocks([toolCall("bash"), narrative("Did the thing."), toolCall("edit")] as never);
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ kind: "content" });
  });

  it("skips blocks that render nothing inside the fold (plans, placeholder actions)", () => {
    const items = collapseFoldBlocks([toolCall("bash"), plan(), toolCall("edit")] as never);
    expect(items).toHaveLength(2);
  });
});
