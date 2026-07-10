# Consolidate @shared Type/Presenter Trees — Plan

## Approach (mirrors the contract consolidation)

### Step 1 — Bring `@argos/shared` to a superset of desktop's tree

Port desktop's evolved content into `packages/shared/src/`:

- **Direct copies** (desktop is strictly ahead, no merge needed):
  `providerDbCatalog.ts`, `types/model-db.ts` (Zod v4 fix), `types/skill.ts`,
  `workspaceConfig.ts` (full runtime), `serverConfig.ts` (desktop-only),
  `settingsNavigation.ts` (desktop-only).
- **Copy + rewrite contract refs** `@shared/contracts/*` → `@argos/shared-contracts/*`:
  `types/plugin.ts` (also adds desktop's `targets`/`platform`/`arch` fields),
  `types/presenters/legacy.presenters.d.ts` (adds `navigateToSettings`,
  `completeGitHubAuthFromDeepLink`).
- **Bidirectional merge** (keep both sides' members):
  `types/agent-interface.d.ts` (add `steerPendingInput`, keep `resumePendingQueue`),
  `types/presenters/agent-session.presenter.d.ts` (add `steerPendingInput` +
  `getViewManifests` + `tape-view-manifest` import, keep `resumePendingQueue`).

### Step 2 — Re-point desktop `@shared/*` → `packages/shared/src`

Order-sensitive aliasing (most specific first):
- `@shared/contracts/*` → `@argos/shared-contracts` (unchanged, from prior work)
- `@shared/*` → `packages/shared/src`

Apply in: Vite `pathAliasPlugin`, `tsconfig.node.json`, `tsconfig.app.tsgo.json`,
`vitest.config.ts`, `vitest.config.renderer.ts`.

### Step 3 — Delete `apps/desktop/src/shared/`

### Step 4 — Verify

desktop typecheck (node + web), daemon + backend-core + shared-contracts typecheck,
full test suite, lint, format.

## Risk

High consumer blast radius (hundreds of desktop files import `@shared/*`), but the
change is purely a resolution re-point after the package is a proven superset, and
59/67 files are already byte-identical. The merges are confined to two `.d.ts` files.
