# ACP Config Options Persistence — Tasks

- [x] 1. Runtime: remembered-options read (elementwise validation) + strict-parse `-32602` fallback + response persistence in `initializeSession` (session/new and session/load paths).
- [x] 2. Tests: `acpSessionManager.test.ts` configOptions describe — round-trip (send + state), `-32602` fallback retry, fresh-response persistence.
- [x] 3. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

