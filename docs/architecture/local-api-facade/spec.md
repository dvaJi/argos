# Local API Facade

## User Need

The Argos renderer should run in both Electron and browser mode without crashing on missing Electron APIs. Native-only capabilities should be explicit, not scattered across UI code.

## Goal

Define a browser-safe local capability facade separate from core `ArgosBridge` backend routes, so web mode does not crash on native APIs and capability boundaries are explicit.

## Acceptance Criteria

- Core backend operations use `window.argos`.
- Host capabilities use a separate local API facade behind `@api/runtime`.
- Electron implementation delegates to preload/native APIs (`window.api`, `window.electron`).
- Browser implementation provides safe fallbacks or explicit unavailable results — never throws on a missing global.
- A `runtimeKind` discriminator (`"electron" | "browser"`) drives capability checks, not direct `window.electron` probes.
- Desktop-only prefixes (`TIER3_PREFIXES`) drive UI gating in both modes.
- Legacy presenter usage is kept out of browser-mode paths (`src/renderer/api/legacy/` quarantine, max 3 files).

## Constraints

- Keep existing desktop behavior.
- Do not migrate every settings component in one pass; settings stay desktop-only for the first milestone.
- Keep `src/renderer/api/legacy/` quarantine rules (exactly 3 `.ts` files today).
- The modern strict wrappers (`api/runtime.ts`) currently throw when `window.api` is missing; browser mode must not hit those throws.

## Non-Goals

- Full settings migration.
- Removing Electron preload.
- Replacing all legacy presenters immediately.

## Decisions

- The facade wraps behind `@api/runtime`, not by replacing `window.api` directly. Runtime helpers choose the Electron or browser implementation based on `runtimeKind`.
- The browser facade mirrors the legacy-quarantine graceful-degradation pattern (`api/legacy/runtime.ts`: optional chaining, null/defaults) rather than the modern strict pattern (`api/runtime.ts`: throws on missing global).
- Settings and splash renderers stay Electron-only for the first milestone (they use `window.electron` direct IPC extensively: `settings/App.tsx`, `settings/main.tsx`, `splash/Loading.tsx`).

## Open Questions

- Should the facade expose a single `capabilities` object (boolean flags per capability) or per-method availability checks?
- Should `window.electron` be stubbed with safe no-ops in the browser build, or should importing code be excluded from the web route set entirely?
