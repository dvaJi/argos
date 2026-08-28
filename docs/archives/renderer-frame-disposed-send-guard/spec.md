# Spec: "Render frame was disposed" errors from window event broadcasts

## Problem

On window focus/blur, the main process logs:

```
Error sending from webFrameMain:  Error: Render frame was disposed before WebFrameMain could be accessed
    at WebFrameMain.send
    at WebContents.send
    at WindowPresenter.sendToAllWindows
    at EventBus.dispatchToRenderer
    ...
    at publishArgosEvent
    at publishWindowStateChanged
    at BrowserWindow.<anonymous>   (window focus/blur handler)
```

Two unguarded send paths fire on every focus/blur:

1. `WindowPresenter.sendToAllWindows` — `window.webContents.send(channel, ...)` for each tracked
   window is only guarded by `window.isDestroyed()`. A WebContents whose render frame was already
   disposed (window teardown race, navigation frame swap, renderer crash) still passes that check,
   and Electron 43's `send` then throws. The synchronous throw propagates
   `publishArgosEvent → eventBus → the BrowserWindow 'focus'/'blur' listener`, aborting the
   broadcast: windows later in the map iteration never receive the event either.
2. `WindowPresenter` lifecycle handlers (`focus`/`blur`/`maximize`/`unmaximize`/full-screen) send
   `window-focused` / `window-blurred` / maximize events directly to `appWindow.webContents` with
   only an `isDestroyed()` guard — same failure.

Sibling paths (`sendToWindow`, `sendToDefaultWindow`, `sendToWebContents`, `sendToActiveTab`,
`sendToDefaultTab`, theme broadcast, tab sends) share the same race with no guard at all.

The settings/floating-window sends inside `sendToAllWindows` and the settings flush already
try/catch — the design intent is clearly that a failed send must not throw.

## User stories

- As a user, a window being closed/reloaded/crashed must not break event delivery to every other
  window, and must not spam the main log with unhandled send errors.
- As a developer, there must be one guarded send pattern for main→renderer WebContents sends in
  the window presenter instead of per-site guards.

## Acceptance criteria

1. All `webContents.send` sites in `WindowPresenter` go through a single guarded helper that
   no-ops on destroyed targets and catches send-time disposal errors (logging one scoped warning).
2. A disposed frame in one window cannot abort a broadcast to the remaining windows.
3. `publishWindowStateChanged` / window lifecycle listeners can no longer throw out of
   `BrowserWindow` 'focus'/'blur' emits due to send failures.
4. No behavior change for healthy windows; existing guards/logging style preserved.

## Non-goals

- Diagnosing why window 2's render frame was disposed (renderer crash recovery, reload
  semantics) — this issue only makes delivery resilient.
- Guarding sends in other presenters (tab/browser presenters own their lifecycle); follow-up if
  the same noise appears there.

## Constraints

- Electron 43 exposes no per-WebContents "is render frame disposed" query; the guard must be
  check + try/catch.
- Keep the helper module-level in `windowPresenter/index.ts` and reuse the `log` scoped logger.
