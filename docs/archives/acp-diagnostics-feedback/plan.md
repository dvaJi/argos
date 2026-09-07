# Plan

1. Replace the legacy Electron-main presenter calls with `ProviderClient` daemon routes, matching the Settings registry source of truth.
2. Pass each registry agent's enabled state into its diagnostics card.
3. Add local workspace-path input and include it in diagnostic and session-list requests.
4. Render explicit idle, loading, disabled, error, and ready feedback in the card; treat a structured error response as a failed probe.
5. Validate focused tests, UI typecheck, formatting, linting, and a React Doctor regression scan.
