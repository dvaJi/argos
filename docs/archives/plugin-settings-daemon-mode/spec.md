# Plugin settings in daemon mode

## User need

Plugin settings contributions must open and work when the UI is served by the daemon.

## Goal

Host a plugin's declared settings entry through the daemon and display it inside Argos with access to the existing plugin status, enable, disable, and action APIs.

## Acceptance criteria

- `settings.open` succeeds in daemon mode and returns a same-daemon settings URL.
- The daemon serves only files below the declared settings entry directory.
- The settings contribution opens in an in-app dialog.
- The contribution can call `getStatus`, `enable`, `disable`, and `invokeAction` through a constrained host bridge.
- The embedded contribution cannot directly access the parent Argos document.
- Missing contributions and invalid asset paths fail safely.

## Constraints

- Keep plugin settings HTML/CSS/JS reusable by the existing desktop window.
- Use typed plugin routes for all settings actions.
- Preserve the desktop presenter behavior.
- Do not grant Node, Electron, or unsandboxed same-origin access to embedded settings.

## Non-goals

- Redesigning individual plugin settings pages.
- Supporting arbitrary external plugin origins.
- Moving native-only runtime guide actions into the browser.

## Open questions

None.
