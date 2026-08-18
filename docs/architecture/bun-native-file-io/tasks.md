# Tasks

## A. Daemon test runner migration

- [x] **A1** Convert `from "vitest"` → `from "bun:test"` in all 49 daemon unit test files
- [x] **A2** Restructure `daemonMcpRuntimeStartup.test.ts` vi.hoisted/vi.mock → mock.module
- [x] **A3** Restructure `daemonMcpRuntimeClients.test.ts` vi.hoisted/vi.mock → mock.module
- [x] **A4** Restructure `daemonSyncRuntime.test.ts` vi.mock → mock.module
- [x] **A5** Rename `test/e2e-chat-flow.test.ts` → `test/e2e-chat-flow.ts`, `test/e2e-hybrid.test.ts` → `test/e2e-hybrid.ts`; update active `docs/issues/*` references
- [x] **A6** `apps/daemon/package.json`: `test` → `bun test`, `test:watch` → `bun test --watch`, drop vitest devDep
- [x] **A7** Delete `apps/daemon/vitest.config.ts`
- [x] **A8** Full `bun test` green in apps/daemon — 258 pass / 0 fail in ~1.9s (two win32-gated tests now actually run: 258 vs 253 under vitest)

## B. Guard

- [x] **B1** Add `bun-file-io` rule to `scripts/architecture-guard.mjs` (daemon src + scripts, allowlist with inline `bun-file-io-exception:` comments)
- [x] **B2** Seed allowlist: environment-identity `wx` writes, acpBinaryGuard fd reads, jsonStoreFactory/daemonConfigPresenter/piAgentProfileManager/localUsageScanner/version sync contracts, afterPack/notarize Node hooks, sign-cua-helper Node-imported script
- [x] **B3** `bun run lint` passes with rule active (verified the rule fires on a deliberately planted violation)

## C. Daemon source migration

- [x] **C1** `jsonStoreFactory.ts` — exception: sync `StoreLike` contract from @argos/backend-core
- [x] **C2** `daemonConfigPresenter.ts` — exception: sync constructor load + sync setters
- [x] **C3** `daemonSkillRuntime.ts` — discovery converted to async Bun.file walk; state store stays sync (exception)
- [x] **C4** `daemonSyncRuntime.ts` — fully converted (zip backup/restore, cloud config chain now async)
- [x] **C5** `piAgentProfileManager.ts` — exception: sync API with sync-chained internals
- [x] **C6** `environment-identity.ts` — exception (wx exclusive-create writes + sync startup)
- [x] **C7** `daemonPluginPresenter.ts` — converted (~15 sites); manifest/package/config reads via Bun.file, writes via Bun.write; plugin install chain async
- [x] **C8** `localUsageScanner.ts` — exception: sync parse/scan API surface
- [x] **C9** `daemonMemoryRuntime.ts` — no read/write call sites (directory ops only), nothing to convert
- [x] **C10** `pi-provider-execution.ts` — no read/write call sites, nothing to convert
- [x] **C11** `bunS3CloudStorageService.ts` — upload/download converted
- [x] **C12** `acpBinaryGuard.ts` — exception: repeated positioned fd reads
- [x] **C13** `daemonDispatcher.ts` — fileReadFile + fileWriteImageBase64 routes converted
- [x] **C14** `daemonWorkspacePresenter.ts` — readFilePreview/readFileText/writeFile/createEntry converted; FileHandle sniff → `Bun.file().slice()`
- [x] **C15** `version.ts` (exception), `logging.ts` (dead helpers deleted), `update.ts` (tmp write converted)
- [x] **C16** `bun test` green (258/0); typecheck clean

## D. Scripts migration

- [x] **D1** Converted: architecture-guard, agent-cleanup-guard, route-catalog-drift-guard, generate-architecture-baseline, fetch-acp-registry, fetch-provider-db, build-cua-plugin-runtime, bump-tap, package-plugin, plugin, validate-packaging-inputs
- [x] **D2** Reverted + exempted: afterPack.js, notarize.js (Node electron-builder hooks), sign-cua-helper.mjs (imported in-process by desktop Node vitest)
- [x] **D3** Spot-run: lint guards pass; `package-plugin.mjs --validate plugins/cua` reaches its environmental missing-binary check (conversion works)

## E. Skill + docs

- [x] **E1** Create `.agents/skills/bun-file-io/SKILL.md`
- [x] **E2** Add File I/O rule + test-runner guidance to `AGENTS.md`
- [x] **E3** `bun run format`, `bun run lint`, `bun run typecheck`, daemon `bun test` green; desktop suite at pre-existing baseline (67 failed before and after — none caused by this change)

## Deviation from plan

1. **Guard sequencing**: plan placed the guard (B) before migration (C/D); in practice the rule was added after migration to avoid a guaranteed-failing intermediate state. Outcome identical.
2. **`sign-cua-helper.mjs` not converted**: desktop vitest imports it in-process under Node with `vi.mock('node:child_process')`; converting would break that suite. Reverted and added to the guard's excluded files with an inline reason.
3. **`architectureGuard.test.ts` runner change**: the desktop fixture test spawns the guard via `process.execPath` (Node); since the guard now uses `Bun.file` for reads, the test spawns `bun` instead. Both tests in that suite fail identically at baseline (fixture lacks `remoteControlPresenter`), so this is pre-existing, not introduced here.
4. **`tsconfig.json` types pin**: added `"types": ["bun"]` (TS 6/7 no longer auto-discovers `@types/*`) so `Bun.*` usage type-checks explicitly rather than through transitive discovery.
5. **Scope shrank in two files** (`daemonMemoryRuntime.ts`, `pi-provider-execution.ts`): audit counted directory-only usage; no read/write call sites exist.
