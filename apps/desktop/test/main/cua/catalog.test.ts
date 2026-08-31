import { describe, expect, it } from "vitest";

import { parsePluginToolCatalog, parsePluginToolCatalogJson } from "@argos/backend-core";

const validTool = {
  name: "click",
  description: "Click at coordinates",
  input_schema: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
  read_only: false,
  destructive: true,
  idempotent: false,
};

describe("parsePluginToolCatalog", () => {
  it("parses a valid catalog and freezes it", () => {
    const catalog = parsePluginToolCatalog({ version: "0.19.2", tools: [validTool] });

    expect(catalog.version).toBe("0.19.2");
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0].name).toBe("click");
    expect(catalog.tools[0].annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.tools)).toBe(true);
  });

  it("rejects non-object roots and empty versions", () => {
    expect(() => parsePluginToolCatalog(null)).toThrow(/root must be an object/);
    expect(() => parsePluginToolCatalog({ version: "  ", tools: [validTool] })).toThrow(
      /version must be a non-empty string/,
    );
  });

  it("rejects empty or duplicate tools", () => {
    expect(() => parsePluginToolCatalog({ version: "1", tools: [] })).toThrow(/non-empty array/);
    expect(() => parsePluginToolCatalog({ version: "1", tools: [validTool, { ...validTool }] })).toThrow(
      /duplicate tool name: click/,
    );
  });

  it("enforces the tool name pattern", () => {
    expect(() => parsePluginToolCatalog({ version: "1", tools: [{ ...validTool, name: "bad name!" }] })).toThrow(
      /name must match/,
    );
    expect(() => parsePluginToolCatalog({ version: "1", tools: [{ ...validTool, name: " padded" }] })).toThrow(
      /name must match/,
    );
  });

  it("requires object input schemas with properties and valid required arrays", () => {
    expect(() =>
      parsePluginToolCatalog({
        version: "1",
        tools: [{ ...validTool, input_schema: { type: "string" } }],
      }),
    ).toThrow(/must declare type "object"/);
    expect(() =>
      parsePluginToolCatalog({
        version: "1",
        tools: [{ ...validTool, input_schema: { type: "object", properties: {}, required: ["x", "x"] } }],
      }),
    ).toThrow(/must contain unique strings/);
  });

  it("requires boolean annotations", () => {
    expect(() => parsePluginToolCatalog({ version: "1", tools: [{ ...validTool, read_only: "yes" }] })).toThrow(
      /read_only must be a boolean/,
    );
  });

  it("parses JSON with error context", () => {
    expect(() => parsePluginToolCatalogJson("{not json", "catalog.json")).toThrow(
      /Invalid plugin MCP tool catalog "catalog\.json"/,
    );
  });
});
