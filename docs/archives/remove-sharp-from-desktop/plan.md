# Plan: Remove `sharp` from Desktop

## Approach
Create a single consolidated `image.process` route that accepts an image buffer (base64) and an array of operations. The daemon runs the operations sequentially via `sharp` and returns the final buffer. This minimizes the number of new routes and keeps the contract simple.

### Route Contract Design

```typescript
// image.routes.ts
imageProcessRoute = {
  name: "image.process",
  input: {
    imageBase64: string,           // source image as base64
    operations: ImageOperation[],  // ordered pipeline
  },
  output: {
    imageBase64: string,           // result image as base64
    metadata?: { width, height, format },
  },
}

type ImageOperation =
  | { type: "metadata" }
  | { type: "resize"; width?: number; height?: number; fit?: "inside" | "cover" | "fill"; withoutEnlargement?: boolean }
  | { type: "jpeg"; quality?: number }
  | { type: "png" }
  | { type: "webp" }
  | { type: "gif" }
  | { type: "composite"; buffers: Array<{ base64: string; top: number; left: number }> }
  | { type: "watermark"; svgBase64: string; top: number; left: number };
```

The pipeline accumulates a `Sharp` instance; each operation mutates or wraps it. `metadata` is a peek operation that reads dimensions without altering the pipeline.

### Why one route instead of many
- All current callers process an image in a single pass (no need for incremental round-trips).
- Reduces HTTP overhead, route catalog bloat, and dispatcher branching.
- Easier to extend with new operation types later.

### Desktop → Daemon Communication
The Electron main process will call the daemon directly over HTTP using a small helper (similar to `resolveUiUrl`). This avoids introducing a new IPC bridge pattern.

Helper location: `apps/desktop/src/main/lib/daemonProxy.ts`
```typescript
export async function callDaemonRoute<T>(route: string, input: unknown): Promise<T>
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared-contracts/src/routes/image.routes.ts` | New route contracts |
| `packages/shared-contracts/src/routes.ts` | Export + catalog |
| `apps/daemon/src/dispatch/daemonDispatcher.ts` | Add `image.process` handler |
| `apps/daemon/package.json` | Add `sharp` dependency |
| `apps/desktop/src/main/lib/daemonProxy.ts` | New HTTP helper to call daemon |
| `apps/desktop/src/main/presenter/filePresenter/ImageFileAdapter.ts` | Replace `sharp` with daemon call |
| `apps/desktop/src/main/contextMenuHelper.ts` | Replace `sharp` with daemon call |
| `apps/desktop/src/main/lib/watermark.ts` | Remove `sharp`; watermark caller uses `image.process` with composite op |
| `apps/desktop/src/main/lib/scrollCapture.ts` | Remove `sharp`; stitch caller uses `image.process` with composite op |
| `apps/desktop/src/main/presenter/tabPresenter.ts` | `stitchImagesWithWatermark` → delegates to daemon |
| `apps/desktop/src/main/routes/index.ts` | `tabStitchImagesWithWatermark` → delegates to daemon |
| `apps/desktop/package.json` | Remove `sharp` dependency |

### Migration of Existing Functions

1. **ImageFileAdapter**
   - `extractImageMetadata()` → `image.process` with `[{type: "metadata"}]`
   - `getThumbnail()` → `[{type: "resize", width: 256, height: 256, fit: "inside", withoutEnlargement: true}, {type: "jpeg", quality: 70}]`
   - `getLLMContent()` → `[{type: "resize", width: 1200, height: 1200, fit: "inside", withoutEnlargement: true}, {type: "jpeg", quality: 70}, {type: "metadata"}]`

2. **contextMenuHelper (save image as)**
   - `[{type: "toFormat", format: "jpg"|"png"|"webp"|"gif"}]` — add a `toFormat` operation that chains the right sharp formatter.

3. **watermark.ts**
   - `addWatermarkToImage(buffer, options)` → create SVG in caller, then call `image.process` with `[{type: "composite", buffers: [{base64: imageBase64, top: 0, left: 0}, {base64: svgBase64, top: height, left: 0}]}]`

4. **scrollCapture.ts**
   - `stitchImagesVertically(buffers)` → call `image.process` with `[{type: "composite", buffers: [...]}]`

5. **tabPresenter.ts**
   - `stitchImagesWithWatermark` → read buffers → base64 → call `image.process` with composite + watermark ops.

### Compatibility
- No UI changes.
- No changes to existing route output shapes (desktop route handler proxies to daemon and returns same structure).

### Test Strategy
- Existing desktop main tests already cover some of these paths.
- Add unit tests for the daemon `image.process` handler if a test file exists for daemon dispatch.
- Manually verify scroll capture + watermark in the app.

## Ordered Implementation

1. Create `packages/shared-contracts/src/routes/image.routes.ts`
2. Register in `ARGOS_ROUTE_CATALOG`
3. Add `sharp` to daemon deps
4. Implement daemon `image.process` handler
5. Create `daemonProxy.ts` helper in desktop main
6. Refactor `ImageFileAdapter.ts`
7. Refactor `contextMenuHelper.ts`
8. Refactor `watermark.ts` + `scrollCapture.ts` + `tabPresenter.ts`
9. Remove `sharp` from desktop deps
10. Format, lint, typecheck, build
