# Tasks: Remove `sharp` from Desktop

## Pending
- [ ] T1: Create route contract `packages/shared-contracts/src/routes/image.routes.ts`
- [ ] T2: Export route in `packages/shared-contracts/src/routes.ts` and add to `ARGOS_ROUTE_CATALOG`
- [ ] T3: Add `sharp` to `apps/daemon/package.json` dependencies
- [ ] T4: Implement `image.process` handler in `apps/daemon/src/dispatch/daemonDispatcher.ts`
- [ ] T5: Create `apps/desktop/src/main/lib/daemonProxy.ts` HTTP helper
- [ ] T6: Refactor `ImageFileAdapter.ts` to use daemon proxy
- [ ] T7: Refactor `contextMenuHelper.ts` to use daemon proxy
- [ ] T8: Refactor `watermark.ts` + `scrollCapture.ts` + `tabPresenter.ts` to use daemon proxy
- [ ] T9: Refactor desktop `routes/index.ts` `tabStitchImagesWithWatermark` to delegate to daemon
- [ ] T10: Remove `sharp` from `apps/desktop/package.json`
- [ ] T11: Run format, lint, typecheck, build
- [ ] T12: Update `tasks.md` → move to `docs/archives/remove-sharp-from-desktop/`

## In Progress
(none)

## Completed
(none)
