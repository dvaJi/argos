# Remove `sharp` from Desktop Main Process

## Goal
Move all image processing (`sharp`) from the Electron main process to the daemon, eliminating `sharp` as a native dependency of `apps/desktop`.

## Classification
Architecture refactor — `docs/architecture/remove-sharp-from-desktop/`

## Current State
`sharp` is imported in 4 files within `apps/desktop/src/main/`:

| File | Operations |
|------|-----------|
| `presenter/filePresenter/ImageFileAdapter.ts` | metadata, resize → JPEG thumbnail, resize → JPEG for LLM |
| `contextMenuHelper.ts` | format conversion (JPEG/PNG/WebP/GIF) from clipboard buffer |
| `lib/watermark.ts` | metadata, composite SVG watermark overlay |
| `lib/scrollCapture.ts` | metadata, vertical composite stitch |

`tabPresenter.ts` already exposes `tabStitchImagesWithWatermark` as a route (`tab.stitchImagesWithWatermark`), but the implementation still calls `sharp` internally.

## Target State
- `apps/desktop/package.json` does not list `sharp` as a dependency.
- All image processing happens in `apps/daemon/src/dispatch/` via new route contracts.
- Desktop main process code calls daemon routes (via internal HTTP) to process images.

## Non-Goals
- Do not migrate `node-pty` (ACP terminals) — deferred to separate effort.
- Do not change UI/renderer code (routes remain transparent to the frontend).
- Do not replace `sharp` with a different image library in the daemon; `sharp` stays there.

## Constraints
- Image buffers travel over IPC → HTTP; base64 encoding is acceptable for the sizes involved (< few MB).
- Must preserve existing `ImageFileAdapter` API for the file presenter.
- Must preserve existing `tabStitchImagesWithWatermark` route output shape.
- Must work in both dev (daemon on port 9527) and packaged builds.

## Acceptance Criteria
- [ ] `sharp` removed from `apps/desktop/package.json` dependencies.
- [ ] `sharp` added to `apps/daemon/package.json` dependencies.
- [ ] New route contracts exist in `packages/shared-contracts/src/routes/image.routes.ts`.
- [ ] Daemon handles all image routes in `apps/daemon/src/dispatch/daemonDispatcher.ts`.
- [ ] `ImageFileAdapter.ts` uses daemon route instead of `sharp` import.
- [ ] `contextMenuHelper.ts` uses daemon route instead of `sharp` import.
- [ ] `watermark.ts` and `scrollCapture.ts` logic moved to daemon; desktop imports removed.
- [ ] `tabPresenter.ts` delegates `stitchImagesWithWatermark` to daemon.
- [ ] `bun run lint`, `bun run format:check`, `bun run typecheck` pass.
- [ ] `bun run build:daemon` and `bun run build` pass.

## Open Questions
- [NEEDS CLARIFICATION] None.
