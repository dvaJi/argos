# Issue: react-scan dev bundle crashes with uncaught TypeError on settings navigation

## Summary

Navigating the main window to the in-app settings route logs an uncaught error from
minified third-party code:

```
VM243:2 Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
    at et.reportAllChanges (<anonymous>:2:19429)
```

All frames are anonymous eval'd code — this is not app code. The culprit is the
`react-scan` "auto" script loaded from an **unpinned** URL in
`packages/ui/index.html`:

```html
<script crossorigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js"></script>
```

Problems with the current setup:

1. The unpkg URL serves **whatever is latest**, so upstream publishes change the dev
   environment silently (its own console warning says the auto-loaded "react-grab"
   helper is outdated vs latest).
2. Its bundled web-vitals instrumentation crashes (`undefined.startTime`) during SPA
   navigation — an uncaught TypeError in every developer's console.
3. It evals its own bundle (the `VM243` sources), making stack traces undiagnosable.

It is already stripped from production builds (`strip-react-scan` plugin in
`packages/ui/vite.config.ts`); only dev is affected.

## Fix

Make React Scan **opt-in** for dev sessions instead of always-on:

- Remove the static script tag from `packages/ui/index.html`.
- Replace the build-time `strip-react-scan` plugin with a dev-only plugin
  (`apply: "serve"`) that injects the tag only when `VITE_REACT_SCAN=1`.
- Document the flag in `.env.example`.

This removes the crash and the unpkg dependency from the default dev experience while
keeping the tool one env var away for debugging sessions.

## Acceptance criteria

- Default dev session: no react-scan script loaded, no banner, no crash.
- `VITE_REACT_SCAN=1 bun run dev`: react-scan loads as before.
- Production builds unaffected (script never included).
