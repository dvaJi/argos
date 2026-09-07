import { describe, expect, it } from "vitest";
import { filterFavoriteModels, filterModelGroups, selectFavoriteModels } from "./composerModelPickerData";

const groups = [
  {
    providerId: "anthropic",
    providerName: "Anthropic",
    models: [
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-opus-4", name: "Claude Opus 4" },
    ],
  },
  {
    providerId: "openai",
    providerName: "OpenAI",
    models: [{ id: "gpt-5", name: "GPT-5" }],
  },
];

describe("filterModelGroups", () => {
  it("returns all groups for an empty keyword", () => {
    expect(filterModelGroups(groups, "")).toEqual(groups);
    expect(filterModelGroups(groups, "   ")).toEqual(groups);
  });

  it("keeps only matching models and drops empty groups", () => {
    const result = filterModelGroups(groups, "opus");
    expect(result).toEqual([
      {
        providerId: "anthropic",
        providerName: "Anthropic",
        models: [{ id: "claude-opus-4", name: "Claude Opus 4" }],
      },
    ]);
  });

  it("matches model id and provider name case-insensitively", () => {
    expect(filterModelGroups(groups, "GPT-5")).toHaveLength(1);
    expect(filterModelGroups(groups, "openai")).toHaveLength(1);
    expect(filterModelGroups(groups, "OPENAI")).toEqual([{ ...groups[1] }]);
    expect(filterModelGroups(groups, "nomatch")).toEqual([]);
  });
});

describe("selectFavoriteModels", () => {
  it("resolves favorites in stored order with provider names", () => {
    const result = selectFavoriteModels(groups, ["openai:gpt-5", "anthropic:claude-sonnet-4"]);
    expect(result).toEqual([
      { providerId: "openai", providerName: "OpenAI", id: "gpt-5", name: "GPT-5" },
      { providerId: "anthropic", providerName: "Anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    ]);
  });

  it("skips favorites whose model is no longer selectable without dropping them from the input", () => {
    const keys = ["anthropic:claude-sonnet-4", "openai:removed-model", "malformed"];
    const result = selectFavoriteModels(groups, keys);
    expect(result).toEqual([
      { providerId: "anthropic", providerName: "Anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    ]);
    expect(keys).toHaveLength(3);
  });
});

describe("filterFavoriteModels", () => {
  const favorites = selectFavoriteModels(groups, ["openai:gpt-5", "anthropic:claude-sonnet-4"]);

  it("returns all favorites for an empty keyword", () => {
    expect(filterFavoriteModels(favorites, "")).toEqual(favorites);
  });

  it("filters by model name, id, or provider name", () => {
    expect(filterFavoriteModels(favorites, "sonnet")).toEqual([favorites[1]]);
    expect(filterFavoriteModels(favorites, "openai")).toEqual([favorites[0]]);
    expect(filterFavoriteModels(favorites, "nomatch")).toEqual([]);
  });
});
