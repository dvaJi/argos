# Tasks — Composer Footer Controls

## Phase 0 — SDD & scaffolding
- [x] Draft `spec.md` / `plan.md` / `tasks.md` (this folder)
- [x] Resolve open Q: `serviceTier` as additive optional `standard|fast` on `SessionGenerationSettings` (persisted, not yet enforced server-side); favorites deferred to follow-up

## Phase 1 — Composer shell (inside-footer placement)
- [x] `ChatInputBox.tsx:39` — added `footerLeft?: ReactNode` prop; now renders combined flex with `border-t border-border/40 px-3 py-2` when either slot present (backward compat)
- [x] `ChatInputToolbar.tsx:6` — added `compact?: boolean` to remove double padding when composed inside `ChatInputBox` footer
- [x] New `ComposerFooterBar.tsx` — wrapper reading stores + `Separator` dividers; renders `Model | Effort | Mode` as specified (Image 5 corrected placement)

## Phase 2 — Model picker (Image 2)
- [x] `ComposerModelPicker.tsx` — `Popover` trigger `ModelIcon/AgentAvatar + display + chevron`; search input `Search models...`; sections `Agents → Provider lab groups` (favorites/legacy deferred)
- [x] Row rendering: `model.name`, ACP `Codex` badge, checkmark for selected; click → `handleSelectProviderModel/handleSelectAcp`
- [x] Wire `handle*`: draft → `draftStore.setState({providerId,modelId,agentId})`, active session → `sessionClient.setSessionModel`; handles `isLocked` for ACP sessions
- [ ] Test: `ComposerModelPicker.test.tsx` — search filter, section grouping, locked state (deferred to next iteration)

## Phase 3 — Effort picker (Image 3)
- [x] Shared: `SessionGenerationSettings.serviceTier?: "standard"|"fast"` in `agent-interface.d.ts:37` + `ServiceTierSchema` in `shared-contracts/common.ts:139`; patch schema inherits via `.partial()`
- [x] `ComposerEffortPicker.tsx` — `DropdownMenu` 2 radio groups (`Reasoning` + `Service Tier`), `Default` badges, `Fast — 1.5× speed…` helper text; disabled when `isAcpAgent||supportsReasoning===false` with tooltip `Not supported`
- [x] Wire persist: `sessionClient.updateSessionGenerationSettings` vs `draftStore.setState({reasoningEffort,serviceTier})` (also added `serviceTier` to `draft.ts:38`)
- [ ] Test: `ComposerEffortPicker.test.tsx` — disabled gating, label mapping `low→Low` etc. (deferred)

## Phase 4 — Mode picker (Image 4)
- [x] `ComposerModePicker.tsx` — `DropdownMenu` 4 items with `title + description` (Image 4 copy), checkmark; v1 maps `Supervised→default`, others→`full_access` (future enum expansion TODO)
- [x] Wire `permissionMode` via `sessionClient.setPermissionMode` / `draftStore.setState({permissionMode})`; hidden for ACP (`isAcpAgent`) as ACP handles its own permissions
- [ ] Optional: add `modeDetail` metadata (deferred)

## Phase 5 — Integration & polish
- [x] `ChatPage.tsx:12` + `ChatPage.tsx:1192` — pass `<ComposerFooterBar />` as `footerLeft` with `compact` toolbar; `PendingInputLane` stays above composer per layout
- [ ] `NewThreadPage.tsx` — same `footerLeft` wiring (follow-up)
- [ ] Remove duplicate quick pickers from `ChatStatusBar` collapsed header (keep advanced panel) — follow-up to avoid regression
- [ ] Keyboard: `Ctrl+1/2/3` favorites; `Escape` handling — follow-up
- [x] A11y + responsive: `max-w-[180px] truncate`, `Separator h-4`, `data-testid="composer-*-picker"` / `composer-footer-bar`
- [x] Run `bun run format` + `bun run lint` + `bun run typecheck:node` — pass; `typecheck:web` has single pre-existing error in `ModelProviderSettings.tsx:125` (verified unrelated)

## Phase 6 — Docs & cleanup
- [ ] Update `docs/architecture` if we promoted composer prefs pattern; delete this SDD folder after merge per `spec-driven-dev.md` retention policy
- [ ] Follow-up issue: expand `PermissionMode` enum to 4 distinct values + `serviceTier` wiring into `providerOptionsMapper`

