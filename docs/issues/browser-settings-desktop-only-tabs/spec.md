# Browser Settings Desktop-only Tabs

## User Need

When Argos is running in daemon-served browser mode, opening unsupported settings tabs must not crash or render empty content.

## Goal

Hide desktop-only settings tabs from browser navigation and show a clear unavailable state when users land on those routes directly.

## Acceptance Criteria

- Browser mode navigation omits settings panes that still rely on legacy presenter or Electron-only APIs.
- Direct browser navigation to unsupported settings routes renders an explanatory placeholder instead of mounting the desktop-only component.
- Provider settings in browser mode stay on the connection-only surface and do not trigger runtime-model or Electron-only rate-limit flows.
- Supported browser settings routes continue to work unchanged.

## Constraints

- Keep desktop settings behavior unchanged.
- Do not attempt a broad presenter migration in this fix.

## Non-Goals

- Making desktop-only tabs fully supported in browser mode.
- Replacing all legacy presenter usage.

## Open Questions

- None.
