# Plan

Execution order matters: the test runner must move first so `Bun.*` usage in daemon
source is exercised by tests that actually run under Bun.

## A. Daemon test runner migration (vitest → bun test)

1. **Convert test imports** — all 49 unit test files in `apps/daemon/test`:
   - `from "vitest"` → `from "bun:test"` (Bun officially exports the `vi` object; the
     suite uses no `vi.hoisted`-adjacent APIs except the 3 files below).
2. **Restructure module mocks** (3 files use `vi.hoisted`, unsupported in Bun):
   - `test/daemonMcpRuntimeStartup.test.ts` — `vi.hoisted` + `vi.mock("@argos/mcp-runtime")`
     → top-level `mock.module("@argos/mcp-runtime", ...)` (lazy factory) with the mock
     functions declared before it.
   - `test/daemonMcpRuntimeClients.test.ts` — same pattern.
   - `test/daemonSyncRuntime.test.ts` — same pattern for its `vi.mock` usage.
3. **Rename standalone harnesses** so `bun test` does not discover them:
   - `test/e2e-chat-flow.test.ts` → `test/e2e-chat-flow.ts`
   - `test/e2e-hybrid.test.ts` → `test/e2e-hybrid.ts`
   - Update the two active references in `docs/issues/*` (archives stay as history).
4. **`apps/daemon/package.json`**:
   - `"test": "bun test"`, `"test:watch": "bun test --watch"`
   - remove `vitest` from devDependencies (root keeps vitest for desktop/ui).
5. **Delete `apps/daemon/vitest.config.ts`** (its exclusions move to the rename in A3).
6. If full-suite runs show cross-file global contamination (bun runs files in one global
   by default), switch to `bun test --parallel` for per-file isolation.

## B. Guard rule (enforcement before migration)

Add to `scripts/architecture-guard.mjs`:

- Rule `bun-file-io`: forbid `readFile`, `readFileSync`, `writeFile`, `writeFileSync`,
  `appendFile`, `appendFileSync` (fs/promises included) in `apps/daemon/src/**` and
  `scripts/*.mjs`.
- Allowlist: exact file + API pairs, each requiring an inline
  `bun-file-io-exception: <reason>` comment at the call site. Seed with:
  - `apps/daemon/src/host/environment-identity.ts` — `writeFileSync` (`wx` exclusive-create)
  - `apps/daemon/src/host/acpBinaryGuard.ts` — fd reads if kept (see C)
- Out of scope for the rule: `apps/daemon/build.mjs`, `apps/desktop/**`, `packages/**`,
  all `vite.config.ts`.

## C. Daemon source migration (18 files, ordered by risk)

Each step: convert, run `bun test`, commit-ready. Directory APIs stay `node:fs`.

| Order | File | Pattern |
|---|---|---|
| 1 | `src/host/jsonStoreFactory.ts` | readFileSync/writeFileSync → Bun.file/Bun.write (ctor init → lazy async load or retained sync exception if structurally sync) |
| 2 | `src/host/daemonConfigPresenter.ts` | same |
| 3 | `src/host/daemonSkillRuntime.ts` | same |
| 4 | `src/host/daemonSyncRuntime.ts` | readFileSync of buffers (zip) → `.bytes()`; writeFileSync of Uint8Array → Bun.write |
| 5 | `src/host/piAgentProfileManager.ts` | hash reads + atomic tmp writes → Bun.write + keep renameSync |
| 6 | `src/host/environment-identity.ts` | keep `wx` writes as exception; plain reads → Bun.file |
| 7 | `src/host/daemonPluginPresenter.ts` | ~60 sites; JSON reads → `.json()`, writes → Bun.write, copyFileSync → node:fs cp stays? (cp is a directory-ish util — keep) |
| 8 | `src/host/localUsageScanner.ts` | text reads → `.text()` |
| 9 | `src/host/daemonMemoryRuntime.ts` | reads/writes → Bun APIs |
| 10 | `src/host/pi-provider-execution.ts` | reads/writes → Bun APIs |
| 11 | `src/host/bunS3CloudStorageService.ts` | readFileSync → `.bytes()`, writeFileSync → Bun.write |
| 12 | `src/host/acpBinaryGuard.ts` | fd reads → review; convert via `Bun.file(fd)`/`.slice()` only if clearly equivalent, else exception |
| 13 | `src/dispatch/daemonDispatcher.ts` | route handlers doing sync I/O → await Bun.file/Bun.write |
| 14 | `src/workspace/daemonWorkspacePresenter.ts` | `fsp.readFile/writeFile` → Bun.file/Bun.write; FileHandle range reads → `Bun.file().slice()` or exception |
| 15 | `src/version.ts`, `src/logging.ts`, `src/update.ts` | small: JSON read → `.json()`, tmp write → Bun.write |
| — | `src/lifecycle.ts` | no read/write (existsSync/mkdirSync only) — untouched |

`Buffer.from(await Bun.file(p).bytes())` where call sites rely on Buffer methods
(`.toString("base64")`); plain `Uint8Array` otherwise.

## D. Scripts migration (12 files with read/write)

Same patterns; scripts already run under `bun`:
`architecture-guard.mjs`, `agent-cleanup-guard.mjs`, `route-catalog-drift-guard.mjs`,
`plugin.mjs`, `package-plugin.mjs`, `bump-tap.mjs`, `build-cua-plugin-runtime.mjs`,
`sign-cua-helper.mjs`, `validate-packaging-inputs.mjs`, `fetch-provider-db.mjs`,
`fetch-acp-registry.mjs`, `distro-check.mjs` (others: `installVss.js`, `afterPack.js`,
`smoke-remote-machine-lifecycle.mjs`, `generate-architecture-baseline.mjs` — convert if
they match the pattern).

## E. Skill, docs, wiring

1. `.agents/skills/bun-file-io/SKILL.md` — runtime boundary table, conversion patterns,
   exceptions, test-runner notes, guard pointer.
2. `AGENTS.md` — add a File I/O bullet under Architecture Notes.
3. `docs/architecture/bun-native-file-io/tasks.md` — tick as completed.

## Verification

```powershell
# Daemon unit suite on bun test, green, e2e harnesses not discovered
cd apps/daemon; bun test

# No stray read/write APIs outside the allowlist
Select-String -Path src\**\*.ts -Pattern "readFile|writeFile|appendFile" -CaseSensitive:$false

# Guards + lint
bun run lint

# Type checks
bun run --filter @argos/daemon typecheck
bun run typecheck

# Full test matrix (desktop vitest + daemon bun test)
bun run test
```
