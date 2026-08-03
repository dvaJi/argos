# electron-vite → vite-plugin-electron — Task List

> **STATUS: COMPLETE — archived.** The migration landed in code. Evidence: `apps/desktop`
> uses `vite-plugin-electron` (`electronSimple` from `vite-plugin-electron/multi-env`) with
> `apps/desktop/vite.config.ts`; `electron.vite.config.ts` and `tsconfig.app.tsgo.json` are
> deleted; `apps/desktop` `dev` script is `vite`. Catalog (now in `package.json` workspaces,
> not `pnpm-workspace.yaml`): `electron@^43.1.0`, `vite@^8.1.4`, `vite-plugin-electron@^1.1.0`
> (exceeds the plan's targets). Verification gates (`bun run format`, `lint`, `typecheck`)
> pass on TypeScript 7 (`tsc`, the Go rewrite — `tsgo` is retired).
>
> The per-phase items below are left as the historical plan; several reference files that no
> longer exist post-migration (`pnpm-workspace.yaml`, `tsconfig.app.tsgo.json`) and the
> `pnpm`/`tsgo` toolchain that has since moved to `bun`/TypeScript 7. They are intentionally
> not edited — this banner is the authoritative completion record.

## Phase 0: SDD spec docs

- [x] Create `docs/architecture/electron-vite-to-vite-plugin-electron/spec.md`
- [x] Create `docs/architecture/electron-vite-to-vite-plugin-electron/plan.md`
- [x] Create `docs/architecture/electron-vite-to-vite-plugin-electron/tasks.md`

## Phase 1: Catalog + dependency swap

- [ ] `pnpm-workspace.yaml`: remove `electron-vite: "5.0.0"`.
- [ ] `pnpm-workspace.yaml`: add `vite-plugin-electron: "^1.0.4"`,
      `vite-plugin-electron-renderer: "^1.0.0"` under `# Electron`.
- [ ] `pnpm-workspace.yaml`: bump `electron: "^40.10.0"` → `"^42.0.0"`.
- [ ] `pnpm-workspace.yaml`: bump `electron-builder: "26.9.0"` → `"^26.15.3"`.
- [ ] `pnpm-workspace.yaml`: bump `electron-store: "^8.2.0"` → `"^11.0.2"`.
- [ ] `pnpm-workspace.yaml`: bump `electron-updater: "^6.8.3"` → `"^6.8.9"`.
- [ ] `apps/desktop/package.json`: replace `"electron-vite": "catalog:"` with the two new
      catalog deps.
- [ ] `apps/desktop/package.json`: bump `"@electron-toolkit/tsconfig": "^1.0.1"` → `"^2.0.0"`.
- [ ] Run `pnpm install` (regenerates lockfile).

## Phase 2: New `vite.config.ts`

- [ ] Create `apps/desktop/vite.config.ts` with multi-env API (main + preload + renderer
      root config).
- [ ] Delete `apps/desktop/electron.vite.config.ts`.

## Phase 3a: `__dirname` → `fileURLToPath(import.meta.url)`

- [ ] `src/main/presenter/windowPresenter/index.ts` (4 sites).
- [ ] `src/main/presenter/windowPresenter/FloatingChatWindow.ts` (2 sites).
- [ ] `src/main/presenter/tabPresenter.ts` (3 sites).
- [ ] `src/main/presenter/lifecyclePresenter/SplashWindowManager.ts` (2 sites).
- [ ] `src/main/presenter/floatingButtonPresenter/FloatingButtonWindow.ts` (2 sites).
- [ ] `src/main/presenter/browser/YoBrowserOverlayWindow.ts` (2 sites).
- [ ] `src/main/presenter/pluginPresenter/index.ts` (1 site).

## Phase 3b: `ELECTRON_RENDERER_URL` → `VITE_DEV_SERVER_URL`

- [ ] `src/main/presenter/windowPresenter/index.ts` (5 sites).
- [ ] `src/main/presenter/tabPresenter.ts` (4 sites).
- [ ] `src/main/presenter/lifecyclePresenter/SplashWindowManager.ts` (multiple sites).
- [ ] `src/main/presenter/browser/YoBrowserOverlayWindow.ts` (2 sites).
- [ ] `src/preload/index.ts` (1 site).
- [ ] `test/main/presenter/lifecyclePresenter/SplashWindowManager.display.test.ts` (3 sites).

## Phase 3c: `import.meta.env.VITE_*` → `process.env.VITE_*` in main

- [ ] `src/main/presenter/githubCopilotOAuth.ts` (9 sites).
- [ ] `src/main/presenter/githubCopilotDeviceFlow.ts` (2 sites).
- [ ] `src/main/presenter/oauthPresenter.ts` (3 sites).
- [ ] `src/main/presenter/llmProviderPresenter/oauthHelper.ts` (2 sites).
- [ ] `src/main/presenter/configPresenter/providerDbLoader.ts` (1 site).
- [ ] `src/main/presenter/lifecyclePresenter/index.ts` (1 site).
- [ ] `src/main/presenter/index.ts` (2 sites).

## Phase 3d: `src/main/env.d.ts`

- [ ] Drop `/// <reference types="vite/client" />` (or keep — Vite still installs it).
- [ ] Replace `ImportMetaEnv` declarations with `NodeJS.ProcessEnv` augmentations.
- [ ] Add `/// <reference types="vite-plugin-electron/electron-env" />`.

## Phase 4: Scripts (`apps/desktop/package.json`)

- [ ] `dev`: `electron-vite dev --watch` → `vite`.
- [ ] `dev:inspect`: → `cross-env ELECTRON_INSPECT=9229 vite`.
- [ ] `dev:linux`: → `vite`.
- [ ] `build`: → `vite build`.
- [ ] `start`: → `electron .`.

## Phase 5: Auxiliary files

- [ ] `apps/desktop/tsconfig.node.json`: rename include glob; remove `electron-vite/node`
      from `types`.
- [ ] `apps/desktop/tsconfig.app.json`: drop stale `src/renderer/browser/**` includes and
      `@browser/*` path.
- [ ] `apps/desktop/tsconfig.app.tsgo.json`: same cleanup.
- [ ] `apps/desktop/electron-builder.yml`: rename config exclusion pattern.
- [ ] `.oxfmtrc.json`: rename `electron.vite.config.ts` → `vite.config.ts`.

## Phase 6: Tests

- [ ] `apps/desktop/test/main/presenter/pluginPresenter.test.ts:665-672`: update filename
      read to `vite.config.ts`; adjust assertion for new preload input shape.
- [ ] `apps/desktop/test/main/presenter/lifecyclePresenter/SplashWindowManager.display.test.ts`:
      rename env var.
- [ ] (Optional) `apps/desktop/vitest.config.renderer.ts`: drop stale `@browser` alias.

## Phase 7: Verification

- [ ] `pnpm install` (no errors).
- [ ] `pnpm --filter @argos/desktop postinstall` (= `electron-builder install-app-deps`)
      — native modules rebuild against Electron 42 headers.
- [ ] `pnpm run format`.
- [ ] `pnpm run lint`.
- [ ] `pnpm run typecheck` (tsgo node + web).
- [ ] `pnpm test` (vitest main + renderer).
- [ ] `pnpm --filter @argos/desktop build` — verify `out/` tree matches US-1.
- [ ] `pnpm --filter @argos/desktop dev` — manual smoke (US-2).
- [ ] `pnpm run e2e:smoke` — Playwright smoke.
- [ ] Confirm preload output filenames (US-1).

## Phase 8: Docs

- [ ] `README.md`: swap Electron-Vite credit link → vite-plugin-electron.
- [ ] Optionally note the Electron 42 bump in the README tech stack section.
