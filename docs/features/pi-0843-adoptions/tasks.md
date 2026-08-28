# Tasks: pi 0.84.2/0.84.3 adoptions

- [x] A: compaction failure surfacing (protocol phase, worker mapping, daemon markError).
- [x] B: powershell tool toggle (protocol init, worker allowlist, buildInit, config plumbing,
      settings switch).
- [x] C: samplingParams hint in ModelConfigDialog (pipe pre-existing from the settings WIP).
- [x] D (found during validation): migrate `DailyUsageChart` to the `@tanstack/charts` 0.16
      `scales` API — master's UI typecheck was failing on a fresh run.
- [x] Validate: typechecks (desktop/daemon/ui), daemon tests (351), lint, format.
- [ ] Manual (Windows): powershell tool visible in a new Pi session; compaction failure surfaces
      as session error + message annotation.
