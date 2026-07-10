# Implementation Plan

1. **Strengthen `DaemonConfigPresenter` against `IConfigPresenter`**
   - Declare `implements IConfigPresenter` and resolve any type mismatches.
   - Port missing skill/path settings (`getSkillsPath`, `setSkillsPath`, `getSkillsEnabled`, `setSkillsEnabled`, `getSkillDraftSuggestionsEnabled`, `setSkillDraftSuggestionsEnabled`, `getSkillSettings`).
   - Fix `getCustomNpmRegistry` return type.
   - Back-fill any other missing store-backed methods with safe defaults (model status, provider db, search engine settings, etc.) so route calls do not throw.

2. **Validate startup**
   - Run a minimal Bun script that calls `startDaemon({ port: 0 })` and confirm it resolves without `TypeError`.

3. **Run end-to-end tests**
   - `bun run test/e2e-chat-flow.test.ts`
   - `bun run test/e2e-hybrid.test.ts`
   - Fix any further dispatch/runtime failures surfaced by the tests.

4. **Run unit tests and type checks**
   - `pnpm --filter @argos/daemon test`
   - `pnpm --filter @argos/daemon typecheck`

5. **Format and lint**
   - `pnpm run format` in affected files.
   - `pnpm run lint` if daemon files changed.
