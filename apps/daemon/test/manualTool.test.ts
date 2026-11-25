import { describe, expect, it } from "bun:test";
import { rankSections, tokenize } from "../src/host/manualTool";

describe("manual search ranking", () => {
  it("prefers heading matches and returns a bounded list", () => {
    const sections = [
      { path: "docs/a.md", heading: "Triggers", body: "Webhooks and folder watches." },
      { path: "docs/b.md", heading: "Memory", body: "Long-term recall. Triggers are not mentioned here." },
      { path: "docs/c.md", heading: "Unrelated", body: "Nothing to see." },
    ];
    const result = rankSections(sections, "triggers webhooks", 1);
    expect(result).toHaveLength(1);
    expect(result[0]?.heading).toBe("Triggers");
  });

  it("drops stop words and short tokens", () => {
    expect(tokenize("How do I use the triggers?")).toEqual(["use", "triggers"]);
  });
});
