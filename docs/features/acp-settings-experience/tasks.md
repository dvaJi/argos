# Tasks

- [x] Audit current ACP settings states and interactions.
- [x] Define the user-facing install, enable, and connection lifecycle.
- [x] Add lifecycle helpers and tests.
- [x] Enable fresh registry installs automatically.
- [x] Replace nested cards with flat agent rows.
- [x] Rewrite diagnostics as connection status and progressive details.
- [x] Improve registry, loading, empty, and error states.
- [x] Run focused tests.
- [x] Run `pnpm run format`.
- [x] Run `pnpm run lint`.
- [x] Run typecheck and React Doctor regression checks.
- [x] Trigger one connection check after explicit enablement and fresh installation.
- [x] Cover registry, manual, and initial-page-load behavior with tests.
- [x] Re-run validation.
- [x] Compact installed and custom agent rows.
- [x] Replace secondary text actions with accessible icon actions.
- [x] Collapse workspace and technical connection data by default.
- [x] Automatically reveal recovery details for connection and authentication failures.
- [x] Add compact-layout regression coverage and re-run validation.

## Validation

- Focused renderer tests: 9 passed.
- UI package typecheck: passed.
- Repository lint and architecture guards: passed with zero warnings.
- React Doctor changed-file score improved from 64 to 69 during this pass. Remaining findings are the existing migration-scale component/compiler work documented separately.
- Automatic connection-check renderer tests: 15 passed.
- Compact connection-details renderer tests: 16 passed.
- Compact-layout UI package typecheck and repository lint: passed.
- React Doctor changed-file score remained at 69; no regression was introduced. The remaining findings are the
  existing ACP component-size, React Compiler `try/finally`, and state-grouping migration work.
