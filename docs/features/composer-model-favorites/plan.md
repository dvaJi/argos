# Plan: composer-model-favorites

## Approach

1. `packages/ui/src/stores/ui/modelFavorites.ts` — localStorage-backed
   TanStack store (`composer-model-favorites:v1`) holding an ordered array of
   `providerId:modelId` keys; `isFavorite` / `toggleFavorite` / `useModelFavorites`.
   Follows the `agentPlan.ts` load/persist pattern (try/catch, versioned key).
2. `packages/ui/src/components/chat/composerModelPickerData.ts` — pure helpers
   extracted so the deferred picker tests can run at the logic level (the
   package has no testing-library):
   - `filterModelGroups(groups, keyword)` (exact current inline semantics)
   - `filterFavoriteModels(favorites, keyword)`
   - `selectFavoriteModels(groups, keys)` (ordered by keys, skips models no
     longer selectable)
3. `ComposerModelPicker.tsx`
   - Provider-model rows become `role="button"` divs (a nested star button is
     invalid inside `<button>`), keeping hover/selected classes and adding
     Enter/Space activation.
   - Star button: `stopPropagation`, filled (`fill-current`, amber) when
     favorited, hover-revealed otherwise.
   - Favorites section pinned above provider groups (provider mode only),
     filtered by the same keyword.
4. Tests: `composerModelPickerData.test.ts` + `modelFavorites.test.ts`
   (vitest, jsdom for localStorage).

## Verification

- `bun run --filter @argos/ui test` green (new tests).
- `bun run format` + `bun run lint` + `bun run typecheck` clean.
- Manual: toggle stars, reload, search-filter favorites, select from favorites
  with and without an active session.
