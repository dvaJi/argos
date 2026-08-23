# Plan — Composer Footer Controls

## Architecture decisions

### 1. Keep `ChatStatusBar` for advanced, add `ComposerFooterBar` for quick switching
- **Rationale:** `ChatStatusBar` (2094 lines, `ChatStatusBar.tsx:171`) already handles temperature, topP, budget, verbosity, MCP, ACP inline options, etc. Shrinking it would be high-risk. Instead, introduce a focused `packages/ui/src/components/chat/ComposerFooterBar.tsx` rendered *inside* `ChatInputBox` (not above), left of `ChatInputToolbar` actions. `ChatInputBox` gains an optional `footerLeft?: ReactNode` prop; `ChatPage.tsx` composes `<ComposerFooterBar />` there, keeping `PendingInputLane` above the composer.
- **Inside-footer layout (Image 5 corrected):**
  ```
  <ChatInputBox rounded-xl border bg-card/30>
    <EditorContent />
    <div class="flex items-center justify-between border-t border-border/40 px-3 py-2">
      <div class="flex items-center gap-1">
        <ComposerModelPicker /> <Separator vertical />
        <ComposerEffortPicker /> <Separator vertical />
        <ComposerModePicker />
      </div>
      <ChatInputToolbar right cluster />
    </div>
  </ChatInputBox>
  <div class="checkout bar below">Current checkout …</div>
  ```
  Tailwind: `text-[13px]`, `h-7 rounded-md`, `text-muted-foreground` when idle, matching T3 density. Separators are `w-px h-4 bg-border/60`.

### 2. Model picker — unify ACP + provider catalogs
- **Source of truth:** Existing `modelStore.getChatSelectableModelGroups()` (provider models) + `agentStore.agents` filtered `agentType==="acp"` + `configClient.listAcpRegistryAgents()`. Favorites overlay stored via `ConfigClient` new key `composerFavoriteModels: string[]` (`providerId/modelId` or `acp/<agentId>`), read by `useModelStore` selector `getFavoriteModelIds`.
- **Sections:** Build from `filteredModelGroups` + ACP list → `displaySections` mirroring `ChatStatusBar:modelDisplaySections` (lab prefix split) plus `★ Favorites` pinned section (sorted by last use). Row: `ModelIcon` (`resolveModelIconId`), name, badge (`Codex` for ACP), pin `lucide:star` toggle, `Ctrl+1…3` for first three favorites (capture `keydown` in composer).
- **Action:** `handleModelQuickSelect(providerId,modelId)` reuses `ChatStatusBar`’s branch: `hasActiveSession ? sessionClient.setSessionModel(sessionId, providerId, modelId) : draftStore.setProviderModel(...)` + `configClient.setSetting("preferredModel",…)`. For ACP, `providerId==="acp"`.
- **Search:** debounced input `Search models…` filtering `providerName + modelId` (same as `filteredModelGroups`).

### 3. Effort picker — reasoning + tier in one menu
- **Data:** Reuse `ChatStatusBar` capability probes: `capabilityReasoningPortrait`, `supportsReasoningEffortFn`, `getReasoningEffortOptions`. Map T3 labels → `ReasoningEffort` (`Low→low`, `Medium→medium`, `High→high`, `Extra High→xhigh`, `Max→max`; `minimal` collapsed into Low). Tier is new additive field: `serviceTier?: "standard"|"fast"` on `SessionGenerationSettings` (`packages/shared/src/types/agent-interface.d.ts:24` + `SessionGenerationSettingsSchema` in `packages/shared-contracts/src/common.ts`). Optional, defaults `standard`; no migration needed.
- **Contract:** Extend `SessionGenerationSettingsPatchSchema` to allow `serviceTier`. Route `sessions.updateGenerationSettings` already passes-through partial patch → `bun-session-repository` persisting JSON; add column handling only if we surface in `normalizeGenerationSettings`. For v1, tier is persisted but not yet enforced server-side (providerOptionsMapper ignores it — log-only).
- **UI:** `DropdownMenu` with two labeled radio groups, `Default` badge on `Medium` + `Standard`. Disabled when `!supportsReasoningEffortFn(...) || isAcpAgent` → `Tooltip` “Not supported”. Write via debounced `pendingGenerationPatchRef` (reuse `ChatStatusBar` timer pattern) or `draftStore.updateGenerationSettings({reasoningEffort, serviceTier})` when no active session.

### 4. Mode picker — permission profile
- **Mapping (v1 compat):** Extend UI to 4 items but map to existing enum to avoid breaking `PermissionModeSchema` (`default|full_access`). Table:
  | UI label | Explainer | Backend value | Notes |
  |---|---|---|---|
  | Supervised | Ask before commands and file changes. | `default` |  |
  | Auto-accept edits | Auto-approve edits, ask before other actions. | `full_access` (with metadata `modeDetail=auto_accept_edits`) | Deferred; v1 maps to `full_access` |
  | Auto | Smart providers approve routine actions… | `full_access` |
  | Full access | Allow commands and edits without prompts. | `full_access` |
  Future: extend `PermissionModeSchema` to `supervised|auto_accept_edits|auto|full_access` and migrate `bun-session-repository.permission_mode` default.
- **UI:** `DropdownMenuContent` width 320, each `DropdownMenuItem` renders `icon + title + description text-xs text-muted-foreground`, checkmark for active. Write via `sessionClient.setPermissionMode` / `draftStore` same as current `ChatStatusBar:permissionOptions`.

### 5. Event flow / clients
- All three pickers go through existing typed clients: `SessionClient` (`setSessionModel`, `updateSessionGenerationSettings`, `setPermissionMode`), `ConfigClient` (`get/setSetting`), `ModelClient` (`getCapabilities`). No new dedicated `composer.updatePrefs` route for v1 — reuse granular routes. Add one small preload exposure only if keyboard shortcuts need global handler.
- Bridge: `getArgosBridge().on(configAgentsChangedEvent, …)` + `sessionStore` sync already refreshes footer labels.

## Touch points

| File | Change |
|---|---|
| `packages/ui/src/components/chat/ChatInputBox.tsx:39` | Add `footerLeft?: ReactNode` prop, render `footerLeft` left of existing toolbar flex (border-t slot). |
| `packages/ui/src/components/chat/ChatInputToolbar.tsx:92` | Split toolbar into `leftCluster` slot + `rightCluster`; or keep as `rightCluster` and let `ChatInputBox` compose both. No API break. |
| `packages/ui/src/components/chat/ComposerFooterBar.tsx` (new) | Composition wrapper reading `useModelStore`, `useAgentStore`, `useSessionStore`, `useDraftStore`, capability hooks; renders three pickers + separators. |
| `packages/ui/src/components/chat/ComposerModelPicker.tsx` (new) | Popover with search, sections, favorites, legacy drill-down. |
| `packages/ui/src/components/chat/ComposerEffortPicker.tsx` (new) | `DropdownMenu` 2 radio groups, capability gating. |
| `packages/ui/src/components/chat/ComposerModePicker.tsx` (new) | `DropdownMenu` 4 items with explainers, mapping to `PermissionMode`. |
| `packages/shared/src/types/agent-interface.d.ts:24` | Add `serviceTier?: "standard"\|"fast"` to `SessionGenerationSettings`. |
| `packages/shared-contracts/src/common.ts` | Extend `SessionGenerationSettingsSchema` + `PermissionModeSchema` compat (add optional `modeDetail` or keep 2-value). |
| `packages/ui/src/pages/ChatPage.tsx` + `NewThreadPage.tsx` | Pass `footerLeft={<ComposerFooterBar …/>}` to `ChatInputBox`; remove duplicate pickers from `ChatStatusBar` quick row only (advanced panel stays). |
| `packages/ui/src/stores/modelStore.ts` | Expose `getFavoriteModelIds()` selector if new. |

## Test strategy
- Renderer: `vitest` + `jsdom` for `Composer*Picker` (search filter, disabled gating, label updates). Existing `ChatStatusBar` tests (if any) stay green.
- Integration: `test:main` config presenter + session presenter — ensure `setSessionModel` / `updateGenerationSettings` / `setPermissionMode` routes handle new `serviceTier` patch without regression.
- Lint/type: `bun run format && bun run lint && bun run typecheck` (web + node). Keep `oxfm`t width 120, double quotes.

## Risks / mitigations
- **Risk:** Inside-footer crowding on narrow windows → collapse labels to icons at `sm` breakpoint, truncate model name. **Mit:** `max-w-[160px] truncate` on button text.
- **Risk:** ACP locked state (`lockedAcpModelId`) — model picker must show “Locked” and be disabled; effort picker hidden for ACP per current gating. **Mit:** mirror `ChatStatusBar:isModelSelectionLocked` / `canSelectPermissionMode` checks.
- **Risk:** `serviceTier` not consumed server-side yet → no-op. **Mit:** mark UI badge “New” and log at `debug` when set; follow-up plan to wire into `providerOptionsMapper`.

## Alternatives considered
- Header above textarea: rejected — user confirmed T3 is inside footer (Image 5), and `PendingInputLane` already occupies the above-composer slot.
- Single new route `composer.updatePrefs`: rejected for v1 — reuses existing granular routes to stay SDD-small.
- Flat model list without ACP grouping: rejected — Argos must surface distribution type (`acp` vs provider) and install state (`installState.status`).

## Compatibility
- Additive, forward-compatible. `serviceTier` optional; old clients ignore it. `PermissionMode` 2-value schema unchanged for v1. No migration for stored sessions. If later expanding permission enum, add DB migration `permission_mode TEXT` default `full_access`.

