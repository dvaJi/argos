# Consolidate @shared Type/Presenter Trees — Tasks

## Status: DONE

- [x] Port desktop's evolved content into `@argos/shared`: `providerDbCatalog.ts`,
      `types/model-db.ts`, `types/skill.ts`, `workspaceConfig.ts` (full runtime),
      `serverConfig.ts` + `settingsNavigation.ts` (desktop-only), `types/plugin.ts`
      (+ `targets`/`platform`/`arch`, contract ref rewritten), `legacy.presenters.d.ts`
      (+ `navigateToSettings`/`completeGitHubAuthFromDeepLink`, contract refs rewritten).
- [x] Bidirectional merge of the two `.d.ts` interfaces (`agent-interface.d.ts`,
      `agent-session.presenter.d.ts`): kept both `steerPendingInput`/`getViewManifests`
      (desktop) and `resumePendingQueue` (daemon); marked the three implementation-
      specific methods optional so both presenters satisfy the shared interface.
- [x] Re-point desktop `@shared/*` → `packages/shared/src` (Vite `pathAliasPlugin`,
      `resolve.alias`, both tsconfigs, both vitest configs); `@shared/contracts/*`
      still → `@argos/shared-contracts`.
- [x] Delete `apps/desktop/src/shared/`.
- [x] Convert 6 relative `../../../shared/*` imports in desktop main + 74 relative
      `../src/shared/*` imports in tests to `@shared/*`.
- [x] Add npm deps (`electron-log`, `@electron-toolkit/utils`, `minimatch`,
      `safe-regex2`) to `packages/shared/package.json` so they resolve when desktop
      compiles the package.
- [x] Verify: desktop typecheck (node + web) + 2294 tests pass; daemon, backend-core,
      shared-contracts typecheck; lint (all guards); format — all green.

## Result

Single `@shared` source of truth at `@argos/shared` (`packages/shared/src`).
Desktop's `apps/desktop/src/shared/` is gone. Combined with the prior contract
consolidation, there is now exactly one contract catalog and one shared type tree.
