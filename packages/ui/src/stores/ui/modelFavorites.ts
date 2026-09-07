import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

const STORAGE_KEY = "composer-model-favorites:v1";

export const favoriteKey = (providerId: string, modelId: string): string => `${providerId}:${modelId}`;

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function persistFavorites(favorites: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {}
}

/**
 * Per-device composer model favorites (provider models only). Local UI
 * preference, same persistence pattern as `agentPlan`/`sidepanel` — no
 * backend round-trip.
 */
export const modelFavoritesStore = new Store({ favorites: loadFavorites() });

export const isFavorite = (providerId: string, modelId: string): boolean =>
  modelFavoritesStore.state.favorites.includes(favoriteKey(providerId, modelId));

export const toggleFavorite = (providerId: string, modelId: string): void => {
  const key = favoriteKey(providerId, modelId);
  const next = modelFavoritesStore.state.favorites.includes(key)
    ? modelFavoritesStore.state.favorites.filter((entry) => entry !== key)
    : [...modelFavoritesStore.state.favorites, key];
  persistFavorites(next);
  modelFavoritesStore.setState({ favorites: next });
};

export function useModelFavorites(): string[] {
  return useStore(modelFavoritesStore).favorites;
}
