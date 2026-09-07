# Tasks: react-scan-dev-crash

- [x] Attribute the `VM243 … startTime` crash to the unpinned react-scan unpkg bundle.
- [x] Remove the static script tag from `packages/ui/index.html`.
- [x] Add dev-only opt-in injection (`VITE_REACT_SCAN=1`) in the vite config; drop the
      dead build-time strip plugin.
- [x] Document the flag in `.env.example`.
- [x] Verify: served dev HTML no longer contains the react-scan tag (deterministic —
      no tag, no script, no crash); opt-in path injects the same tag as before.
