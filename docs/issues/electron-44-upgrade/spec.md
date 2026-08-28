# Spec: Electron v43.4.1 → v44.0.0 upgrade

## Summary

Upgrade Electron to 44.0.0 (Chromium 152, Node 24.18.1, V8 15.2). Breaking changes reviewed
against Argos' actual usage; one migration required (clipboard), the rest are deployment-policy
notes.

## Breaking changes vs Argos

| Change | Resolution |
|---|---|
| `clipboard` module removed from renderer/preload; W3C-aligned async API (`writeImage` removed) | Preload `copyText`/`copyImage`/`readClipboardText` route over IPC (`clipboard:write-text|write-image|read-text`) to main-process handlers in `WindowPresenter` using the async API; `FilePresenter.copyImage` writes a normalized PNG via `ClipboardItem` + `Blob` |
| macOS 12 (Monterey) no longer supported | Deployment note: **macOS 13+ required** — document in release notes |
| 32-bit builds removed (win ia32, linux armv7l) | None — build matrix is x64/arm64 |
| ANGLE statically linked; `libEGL`/`libGLESv2` no longer shipped | None — not shipped manually |
| `net.request` document-dest `Sec-Fetch-*` restriction | None — `net.fetch(url)` calls don't set those headers |
| Unity desktop removed on Linux | None |

## Acceptance criteria

- [x] No `clipboard` usage in preload/renderers; all operations via IPC to main.
- [x] Handler registration is idempotent (`removeHandler` before `handle`) so presenter
      re-initialization cannot throw.
- [x] Fire-and-forget preload invokes swallow rejections (clipboard failures are not actionable
      in the renderer).
- [x] Raw-channel baseline for `windowPresenter/index.ts` raised 4 → 7 in the architecture guard
      (three new preload-support channels), documented here.
- [x] Typecheck (desktop), lint, format:check pass; `test:main` failure set identical to
      master's pre-existing failures (tests mock Electron).

## Deployment notes (release checklist)

- **macOS 13+ required** (Monterey dropped by Chromium 152).
- Windows/Linux: x64 + arm64 only (unchanged for Argos).
- Manual verification: launch-at-login toggle, image copy from chat context menu, chat
  copy/paste, `shell.openExternal` links.

## Non-goals

- Propagating clipboard write promises through the full api/client layers (fire-and-forget is
  the established UX; failures are non-actionable).
- Sender-frame validation on the clipboard IPC channels: every window loads first-party UI with
  the app's own preload; no remote content can invoke them.
