# Plan: Guard main→renderer sends against disposed render frames

## Approach

Introduce a module-level `safeSendWebContents(target, channel, ...args)` helper in
`apps/desktop/src/main/presenter/windowPresenter/index.ts`:

```ts
if (!target || target.isDestroyed()) return;
try { target.send(channel, ...args); }
catch (error) { log.warn(`Skipping send of "${channel}": ...`); }
```

Then route every previously unguarded `webContents.send` in the file through it:

- theme broadcast (SYSTEM_EVENTS listener)
- `sendToAllWindows` per-window main send (the throwing path) and tab sends
- `sendToWindow` main + tab sends
- `sendToDefaultWindow`, `sendToWebContents`
- lifecycle handlers: focus/blur (`window-focused`/`window-blurred`),
  maximize/unmaximize, enter/leave full screen
- `sendToActiveTab`, `sendToDefaultTab` fallbacks and tab sends

Sites already wrapped in try/catch (settings window, floating chat, settings flush) are left as-is.

## Affected interfaces

- Internal to `WindowPresenter`; `IWindowPresenter` signatures unchanged. Callers
  (`eventBus.dispatchToRenderer`, `publishArgosEvent`, window lifecycle listeners) keep working —
  sends now resolve/no-op instead of throwing.

## Compatibility

- No contract/route/renderer changes. Renderers observe no difference for healthy windows;
  dying windows stop producing main-process error noise.

## Test strategy

- `bun run typecheck`, `bun run lint` (guard scripts + oxlint).
- Existing window presenter tests keep passing.
- Manual/dev: focus/blur cycling with a closing window produces no
  "Error sending from webFrameMain" output; other windows still receive
  `window.state.changed` events.
