# Feature: Composer model favorites

## User need

The composer model picker lists every enabled provider model grouped by
provider (capped at 12 rows per group, rest behind "N more…"). Users with
several providers must re-find their usual models through the group list or
the search box on every pick. A persistent favorites section gives one-click
access to the handful of models actually used.

Deferred from `composer-footer-controls` ("favorites deferred to follow-up");
that deferral predates the #86 composer rework, so this feature is scoped
against the current `ComposerModelPicker.tsx`.

## Goal

- A star toggle on each provider-model row in the picker. Favorited models
  appear in a pinned **Favorites** section at the top of the list (provider
  mode only — ACP agents keep their own list).
- Selection, search, and locked-ACP behavior are unchanged; favorites respect
  the active search keyword.
- Favorites persist locally per app install (localStorage), following the
  existing UI-preference pattern (`agentPlan`, `sidepanel`, `threadSidebar`).
  No backend/config round-trip: this is a per-device UI preference.

## Non-goals

- No keyboard shortcuts (the `Ctrl+1/2/3` idea from the footer-controls
  follow-up stays deferred; this slice is list + toggle).
- No favorites for ACP agents or in the settings model lists.
- No cross-device sync.

## Acceptance criteria

- [ ] Toggling a star updates the Favorites section immediately and survives a
      page reload (localStorage persistence).
- [ ] Favorites referencing models that later disappear (provider disabled,
      model removed) are hidden from the list but preserved in storage.
- [ ] Search filters the Favorites section with the same match semantics as
      provider groups (model name, model id, provider name).
- [ ] Clicking a favorite selects it through the same path as a group row
      (draft when no active session, `setSessionModel` when active).
- [ ] Pure helpers + store are unit-tested (filtering, favorite resolution,
      toggle/persistence); `bun run test` green.
