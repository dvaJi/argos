# Legacy Cleanup (pre-v1) Tasks

## Phase 1 — dead code

- [x] 1.1 `remoteControlPresenter` — **not dead**: 16-line typed daemon-route
      client, live in the shell. Stale "legacy" comment corrected; keep.
- [x] 1.2 Sweep `legacyTypedEventBridge` subscribers; delete bridge + setup call.
      Sweep verdict: of ~40 translations only `window.state.changed` was live
      end-to-end (desktop-only `window.` event → IPC → `AppBar`). All other
      translations were dead letters: their renderer subscriptions are routed
      over WS to the daemon, which never emits those names. Live path preserved
      in `apps/desktop/src/main/routes/windowEventBridge.ts`; bridge deleted.
- [x] 1.3 Delete `initializeMetaFromLegacyStore` + call sites
      (`modelConfig.ts`); orphaned `isEntryUserDefined` removed; fresh stores
      now lazily seed meta via `getOrCreateMeta()`.
- [x] 1.4 Remove `defaultVisionModel` field + migration branches
      (`configPresenter/index.ts`: store type, key unions, reconcile + build +
      anthropic/deprecated cleanup branches; tests updated).
- [x] 1.5 Prune `generate-architecture-baseline.mjs` + `architecture-guard.mjs`
      quarantine/retired-entry logic for the deleted layer (`api/legacy`):
      quarantine constants/metrics/P0 gate removed; business-only metrics kept;
      dead `isRendererQuarantineFile` hook removed; remote-control collection
      made existence-safe (fixes pre-existing guard-fixture test crash).
- [x] 1.6 Rewrite stale AGENTS.md sections (quarantine, useLegacyPresenter) —
      now documents the typed-client-only rule and guard behavior.

## Phase 2 — renderer transport

- [x] 2.1 Map each of the 7 `window.electron/window.api` files to typed
      clients/wrappers; rewire; 0 hits on verification grep.
      - Settings components → typed `*Client` classes (`#api/*Client`).
      - Raw desktop-native notification channels (splash progress, skill
        lifecycle, settings navigation/check-updates/new-discoveries) now flow
        through the sanctioned `onIpcChannel` wrapper in
        `packages/ui/api/runtime.ts` (intentional compat surface; senders
        unchanged).
      - Platform access via `getRuntimePlatform()`; browser shim installs via
        typed global cast in `web/main.tsx`; dead ACP-debug IPC listener
        removed (no sender exists since ACP debug moved behind
        `providers.runAcpDebugAction`).
- [x] 2.2 Replace `usePresenter(` sites with typed clients; 0 hits.
      Added 30 route contracts (config ×14, window ×3, device ×2,
      project.pathExists, providers ×4 incl. refreshProviderDb, skills.readSkillFile,
      skillsync ×7, oauth ×2, nowledgeMem ×3, settings.ready), desktop-only
      registration for the Electron-resident ones, main-kernel dispatch cases
      (+ runtime now carries skillSync/oauth/nowledgeMem presenters), client
      methods across Config/Device/Window/Provider/Skill/Project clients plus
      new SkillSyncClient/OAuthClient/NowledgeMemClient; all call sites rewired.
      `presenterBridge.ts` no longer exports `usePresenter`.
      Also fixed drift found on the way: `daemonDispatcher.isDesktopOnlyRoute`
      carried a stale duplicated prefix list; it now delegates to
      `@argos/shared-contracts/desktop-only` (single source of truth), so the
      daemon explicitly rejects the new desktop-only routes in headless mode.
- [x] 2.3 Settings renderer smoke: typecheck:web passes (covers
      `packages/ui/settings/**` including both entries); oxlint clean on all
      touched files.

## Verification gate

- [x] V1 grep: `window\.electron|window\.api\b` → **0** in packages/ui.
- [x] V2 grep: `\busePresenter\s*\(` → **0** in packages/ui.
- [x] V3 grep: `legacyTypedEventBridge` → **0** in apps/desktop/src.
      NOTE: `remoteControlPresenter` stays per task 1.1 (live feature); its
      surface is limited to the presenter allowlist enforced by
      architecture-guard (`desktop-remote-runtime-ownership`) plus the shell
      wiring in `presenter/index.ts`.
- [x] V4 desktop+daemon+ui typecheck clean (`typecheck:node`, daemon `tsc
      --noEmit`, `typecheck:web` all exit 0).
- [x] V5 test suites vs pre-session baseline (index-tree worktree):
      desktop `test:main` 37 failed / 1593 passed vs baseline 39 / 1592
      (−2 failures: architecture-guard fixture tests fixed; per-test diff shows
      **zero new failing tests**; remaining failures are pre-existing/
      environmental, e.g. `spawn agent ENOENT`). Daemon `bun test`: 0 failed /
      344 passed (baseline 0/320; +24 assertions from the new routes).
      `packages/ui` has no test files (pre-existing).
- [x] V6 lint (agent-cleanup-guard, architecture-guard, route-catalog-drift-guard,
      oxlint --deny-warnings) + `oxfmt` clean.

## Known follow-ups (out of scope for this goal)

- `scripts/generate-architecture-baseline.mjs` currently exits silently on
  Windows without rewriting the baseline `.md` reports (pre-existing; last
  successful generation 2026-08-20). The script itself is pruned and
  lint-clean; refreshing `docs/architecture/baselines/*` needs a separate fix.
- Raw desktop-native channels listed under "Intentional compat kept" can later
  be promoted to typed event contracts + `publishArgosEvent` senders once the
  HybridBridge can fan a single event to both IPC and WS transports.

## Intentional compat kept (documented)

Raw desktop-native notification channels accessed only via the sanctioned
`onIpcChannel`/runtime wrappers (splash progress, skill lifecycle,
settings navigation/check-updates, skill-sync new-discoveries): senders and
receivers stay byte-compatible while direct `window.electron`/`window.api`
access is eliminated. `legacyFunctionCallMiddleware`, ACP id aliases,
session-repository wrap, provider id→apiType fallback, onboarding step-id map:
unchanged per spec.
