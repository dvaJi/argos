# Legacy Cleanup (pre-v1) Spec

## Goal

Eliminate every remaining "legacy" surface that is dead code or un-migrated
transport, so the only "legacy" strings left in the repo are intentional
data/protocol compatibility shims.

## Scope

### Phase 1 — Dead code deletion

1. `remoteControlPresenter/` — legacy compatibility surface; the daemon owns
   remote-control state. Delete after confirming its consumers are satisfied by
   `RemoteControlPresenterLike` daemon ports.
2. `legacyTypedEventBridge.ts` — daemon events reach renderers over the WS
   bridge; delete after subscriber sweep.
3. `initializeMetaFromLegacyStore()` in `modelConfig.ts` — pre-mirror layout.
4. `defaultVisionModel` migration-only field + its migration branches.
5. Stale baseline tooling: `generate-architecture-baseline.mjs` quarantine
   metrics, `architecture-guard.mjs` retired-entry checks for
   `packages/ui/api/legacy`.
6. `AGENTS.md` sections describing the removed quarantine regime.

### Phase 2 — Renderer transport migration

7. Settings renderer: remove direct `window.electron` / `window.api` usage in 7
   files (`SkillsSettings`, `SyncPromptDialog`, `AboutUsSettings`,
   `AcpDebugDialog`, `SettingsOverview`, settings `App.tsx`, `main.tsx`) → typed
   `window.argos` clients.
8. Replace remaining 24 `usePresenter(` call sites in `packages/ui/src` with
   typed clients.

### Keep (intentional compat, documented)

`legacyFunctionCallMiddleware`/toolProtocol, ACP id aliases + registry migration,
session-repository plain-text wrap, provider id→apiType fallback,
onboarding step-id map.

## Verification (100% checklist)

- `Get-ChildItem -Recurse -Include *.ts,*.tsx | Select-String "window\.electron|window\.api\b"` → 0 hits under `packages/ui`.
- `Select-String "\busePresenter\s*\("` → 0 hits under `packages/ui/src` + `packages/ui/settings`.
- `Select-String "agentPresenter|useLegacyPresenter|api/legacy"` → only guard/baseline history notes.
- `bun run typecheck:node` + `typecheck:web` clean; suites no new failures vs HEAD; lint/format clean.
