// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { favoriteKey, isFavorite, loadFavorites, modelFavoritesStore, toggleFavorite } from "./modelFavorites";

const storageKey = "composer-model-favorites:v1";

beforeEach(() => {
  localStorage.clear();
  modelFavoritesStore.setState({ favorites: [] });
});

describe("modelFavoritesStore", () => {
  it("toggles favorites on and off and persists them", () => {
    toggleFavorite("anthropic", "claude-sonnet-4");
    expect(isFavorite("anthropic", "claude-sonnet-4")).toBe(true);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([favoriteKey("anthropic", "claude-sonnet-4")]);

    toggleFavorite("anthropic", "claude-sonnet-4");
    expect(isFavorite("anthropic", "claude-sonnet-4")).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([]);
  });

  it("loadFavorites restores persisted favorites", () => {
    localStorage.setItem(storageKey, JSON.stringify(["openai:gpt-5", "anthropic:claude-opus-4"]));
    expect(loadFavorites()).toEqual(["openai:gpt-5", "anthropic:claude-opus-4"]);
  });

  it("loadFavorites survives missing and corrupted storage", () => {
    expect(loadFavorites()).toEqual([]);
    localStorage.setItem(storageKey, "not-json{");
    expect(loadFavorites()).toEqual([]);
    localStorage.setItem(storageKey, JSON.stringify([42, "openai:gpt-5", null]));
    expect(loadFavorites()).toEqual(["openai:gpt-5"]);
  });
});
