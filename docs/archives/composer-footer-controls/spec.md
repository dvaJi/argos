# Spec — Composer Footer Controls (T3-style Model / Effort / Mode)

## Goal
Move the primary per-message controls (model, effort/tier, permission mode) into the composer footer — the same density and interaction as T3 Code — so users can switch without opening settings. Corrects prior “above textarea” assumption: T3 places controls **inside the composer**, bottom row left-aligned with separators, send button right-aligned (see user screenshot 5).

## Context / Source
- T3 Image 1–5: footer bar `Model ▾ | Effort ▾ | Full access ▾` lives *inside* the rounded composer (`Ask for changes…`). Image 2 shows model picker grouped by lab/ACP with search/favorites/shortcuts/legacy drill-down. Image 3 shows effort picker (`Reasoning: Low/Medium*/High/Extra High/Max` + `Service Tier: Standard*/Fast (1.5×)`). Image 4 shows mode picker (`Supervised / Auto-accept edits / Auto / Full access` with one-line explainers).
- Argos is *different*: models come from two planes — **ACP agents** (Codex, Claude, etc., each with versioned binary/`npx` distributions) and **LLM providers** (Anthropic, OpenAI-compatible, etc.). Current picker lives in `ChatStatusBar` (`packages/ui/src/components/chat/ChatStatusBar.tsx:186`) with search, lab prefix splitting (`modelDisplaySections`), and a gear → expanded generation settings panel. Generation settings (`SessionGenerationSettings`, `RENDERER_MODEL_META.reasoning`) already support `reasoningEffort` (`minimal|low|medium|high|xhigh|max`) but **no `serviceTier`** field. `PermissionMode` is `default|full_access` (only 2) vs T3’s 4; and effort/tier/mode are gated by `ReasoningPortrait`/`supportsReasoningEffortFn` and `isAcpAgent`.

## User stories
1. As a user composing a message, I can change **model** (ACP agent or provider model) inline without leaving the composer — search, favorites, keyboard hints, legacy grouping.
2. As a user, I can change **effort** (reasoning) and **tier** (fast/standard) in one menu when the selected model supports reasoning; the menu is disabled/gray with tooltip otherwise.
3. As a user, I can change **permission mode** in one menu; labels match T3 explainer copy, backed by the session’s `permissionMode`.
4. As a user, my selections persist per-session (active session) or per-draft (new thread), and are reflected immediately in the footer labels.

## Acceptance criteria (testable)
- **Placement:** Controls render *inside* `ChatInputBox` footer, left cluster `Model | Effort | Mode` with `Separator` dividers, send/queue/stop + attach/voice right cluster. No header above textarea. `PendingInputLane` stays above composer.
- **Model picker (Image 2 parity):**
  - Groups: ★ Favorites → ACP agents (icon + name + distribution badge) → Provider models grouped by lab prefix (`openai/gpt-…`) → `Legacy models ▸`.
  - Each row shows model name, provider/ACP badge, pin toggle, `Ctrl+1/2/3` hint for first 3; search filters `providerName+modelId`.
  - Selecting ACP agent → `agentStore.selectedAgentId` (draft) or `sessionClient.setSessionModel` (active session, route `sessions.setModel`).
- **Effort picker (Image 3 parity):**
  - Two radio groups in one `DropdownMenuContent`: `Reasoning` (`Low / Medium* / High / Extra High / Max`) mapping to `reasoningEffort` (`low|medium|high|xhigh|max`; note `minimal`→Low) + `Service Tier` (`Standard* / Fast — 1.5× speed, increased usage`).
  - Disabled when `!supportsReasoningEffortFn(portrait)` or `isAcpAgent`; shows tooltip “Not supported by this model”.
  - Writes via `sessionClient.updateSessionGenerationSettings` (debounced, existing `pendingGenerationPatchRef` pattern) or `draftStore.updateGenerationSettings`. Adds optional `serviceTier` to `SessionGenerationSettings` if not present (see Plan).
- **Mode picker (Image 4 parity):**
  - Items with title + 1-line description: `Supervised — Ask before…`, `Auto-accept edits — Auto-approve edits…`, `Auto — Smart providers…`, `Full access — Allow commands and edits…`.
  - For v1, back-compat: `Supervised`→`default`, `Full access`→`full_access`; middle two map to `full_access` with telemetry or future `PermissionMode` extension behind feature flag (no contract break).
  - Writes via `sessionClient.setPermissionMode` / draft store.
- **State/UX:** Footer labels update instantly; dropdowns use shadcn `DropdownMenu`/`Popover` (existing pattern), keyboard `↑/↓` + `Enter`, count badges where relevant.
- **No regression:** `ChatStatusBar`’s expanded model settings panel remains for advanced numeric fields; footer is the *quick switcher*.

## Non-goals (v1)
- Expanding `PermissionMode` enum to 4 distinct backend values (deferred; UI maps to existing 2).
- Pricing/tier enforcement beyond UI flag (fast tier is a hint).
- Auto-detection of legacy models beyond existing provider metadata.

## Open questions (resolve before code)
- [x] Placement is *inside* footer — confirmed by user Image 5.
- [ ] Exact `serviceTier` contract: add `serviceTier: "standard"|"fast"` to `SessionGenerationSettingsSchema` + `REASONING_EFFORT_VALUES` mapping, or keep UI-only until backend supports it? (Plan proposes additive optional field.)
- [ ] Favorite persistence key: reuse `providerTimestamps`/`providerOrder` or new `favoriteModels` in `ConfigClient`?

## UX states
- Loading (`modelStore.initialized === false`): footer shows skeleton/disabled buttons.
- Empty/error: “Failed to load” with retry.
- ACP locked (`lockedAcpModelId`): model picker disabled with lock icon.
