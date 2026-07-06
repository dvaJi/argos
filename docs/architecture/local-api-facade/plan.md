# Plan

## Current State

- `window.api` is exposed by the preload (`apps/desktop/src/preload/index.ts:23-93`), typed at `index.d.ts:8-19`: clipboard, image copy, file-path conversion, window/webcontents IDs, arch, external open.
- `window.argos` is the typed bridge (`preload/index.ts:265-273`): `{ invoke, on, connection, workspace }`.
- `window.electron` (from `@electron-toolkit/preload`) is used directly in `src/renderer/settings/` and `src/renderer/splash/` for raw IPC.
- Two wrapper patterns exist:
  - **Modern strict** (`apps/desktop/src/renderer/api/runtime.ts:7-8`): throws `if (!window.api)`. Used by business code.
  - **Legacy graceful** (`apps/desktop/src/renderer/api/legacy/runtime.ts:8,16`): optional chaining, returns null/defaults. Quarantined to 3 files.
- No `runtimeKind` / `isBrowser` detection exists in the renderer.

## Approach

Separate backend transport from local host capabilities:

- `window.argos`: typed backend route/event transport (via `ArgosBridge`).
- Local API facade: clipboard, file path conversion, external link opening, dialogs, platform info, window IDs — behind `@api/runtime`, selected by `runtimeKind`.

## Facade Shape

Mirror the existing `window.api` shape (`preload/index.d.ts:8-19`) so the facade is a drop-in:

```ts
interface LocalApi {
  copyText(text: string): void;
  copyImage(image: string): void;
  readClipboardText(): string;
  getPathForFile(file: File): string;
  getWindowId(): number | null;
  getWebContentsId(): number;
  getArch(): string;
  openExternal?(url: string): Promise<void>;
  toRelativePath?(filePath: string, baseDir?: string): string;
  formatPathForInput?(filePath: string): string;
}
```

A `getLocalApi(): LocalApi` helper returns the Electron or browser impl based on `runtimeKind`.

## Implementations

- **Electron local API**: wraps the existing preload `window.api` and `window.electron` capabilities; keeps native dialogs and file paths.
- **Browser local API**:
  - `copyText` / `readClipboardText`: `navigator.clipboard`.
  - `copyImage`: best-effort `navigator.clipboard.write`; no-op if unavailable.
  - `getPathForFile` / `toRelativePath` / `formatPathForInput`: return `""` or filename (no filesystem path in browser).
  - `getWindowId` / `getWebContentsId`: return `null` / `0`.
  - `getArch`: return `"browser"`.
  - `openExternal`: `window.open(url, "_blank", "noopener")`.

## Capability Detection

- `runtimeKind: "electron" | "browser"` — set by the preload (`"electron"`) and the browser bootstrap (`"browser"`), consumed via `getRuntimeKind()`.
- Components gate UI by `runtimeKind` and by the `TIER3_PREFIXES` set (extracted to shared-contracts per `headless-web-access`), not by probing `window.electron`.
- Do not overload `ConnectionState.mode` (local/remote) with browser semantics.

## UI Policy

- Browser mode renders core chat/session/provider/model UI.
- Settings and splash remain desktop-only for the first milestone (they depend on `window.electron` raw IPC).
- Components check `runtimeKind` / capability flags rather than `window.electron` directly.
- Desktop-only actions (`TIER3_PREFIXES`: open folder, select directory, reveal file, native save) render as hidden/disabled with an explicit "not available in browser" state.

## Migration Path

- Business code under `src/renderer/src/` migrates from direct `window.api` to `getLocalApi()` incrementally.
- The strict-throw wrappers in `api/runtime.ts` are kept for Electron; browser code routes through the facade which never throws.
- No additions to `src/renderer/api/legacy/` (it is at its 3-file cap); the facade is new code under `api/`.

## Testing

- Unit-test the browser facade without Electron globals (clipboard, openExternal, path stubs).
- Unit-test the Electron facade wrappers with mocked preload APIs.
- Unit-test `runtimeKind` detection and capability gating.
- Add an architecture-guard follow-up to prevent new direct `window.electron` usage outside allowed legacy areas in browser-reachable code.
