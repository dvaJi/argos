/**
 * Pure data helpers for `ComposerModelPicker` — kept out of the component so
 * search/grouping/favorite semantics are unit-testable without rendering.
 */

/** Structural subset of the picker's model group (see `modelStore`). */
export type PickerModelGroup = {
  providerId: string;
  providerName: string;
  models: Array<{ id: string; name?: string }>;
};

/** A favorite resolved against the currently selectable groups. */
export type PickerFavoriteModel = {
  providerId: string;
  providerName: string;
  id: string;
  name?: string;
};

/**
 * Filter groups by keyword. A group survives when at least one of its models
 * matches; only matching models are kept. Matching is case-insensitive across
 * model name, model id, and provider name — identical to the inline logic
 * this extracts.
 */
export const filterModelGroups = (groups: PickerModelGroup[], keyword: string): PickerModelGroup[] => {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return groups;
  return groups.flatMap((group) => {
    const models = group.models.filter((model) =>
      `${model.name} ${model.id} ${group.providerName}`.toLowerCase().includes(kw),
    );
    return models.length > 0 ? [{ ...group, models }] : [];
  });
};

/**
 * Resolve stored favorite keys (`providerId:modelId`) against the currently
 * selectable groups. Order follows the stored favorites (most recently added
 * last); favorites whose model is no longer selectable are skipped but not
 * removed from storage.
 */
export const selectFavoriteModels = (groups: PickerModelGroup[], favoriteKeys: string[]): PickerFavoriteModel[] => {
  const modelsByProviderId = new Map(
    groups.map((group) => [
      group.providerId,
      new Map(group.models.map((model) => [model.id, { ...model, providerName: group.providerName }])),
    ]),
  );
  const resolved: PickerFavoriteModel[] = [];
  for (const key of favoriteKeys) {
    const separator = key.indexOf(":");
    if (separator <= 0) continue;
    const providerId = key.slice(0, separator);
    const modelId = key.slice(separator + 1);
    const model = modelsByProviderId.get(providerId)?.get(modelId);
    if (!model) continue;
    resolved.push({ providerId, id: modelId, providerName: model.providerName, name: model.name });
  }
  return resolved;
};

/** Filter resolved favorites by keyword (same match semantics as groups). */
export const filterFavoriteModels = (favorites: PickerFavoriteModel[], keyword: string): PickerFavoriteModel[] => {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return favorites;
  return favorites.filter((favorite) =>
    `${favorite.name} ${favorite.id} ${favorite.providerName}`.toLowerCase().includes(kw),
  );
};
