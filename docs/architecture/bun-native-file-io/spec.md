# Bun-native file I/O in Bun-runtime code

## Problem

Argos runs on two JS runtimes: the Electron main process (Node) and the daemon (Bun). File
I/O everywhere uses `node:fs`, even inside the daemon where Bun ships heavily optimized
`Bun.file()`/`Bun.write()` APIs that Bun explicitly recommends for reads and writes.

Additionally, daemon unit tests run under vitest on Node. That blocks any use of `Bun.*`
in daemon source under test (the `Bun` global does not exist in vitest's Node workers),
so the migration also requires moving the daemon suite to Bun's built-in test runner.

Without mechanical enforcement, migrated code slowly regresses back to `node:fs` reads
and writes, and agents unfamiliar with the runtime boundary introduce `Bun.file()` into
Electron-main code where it crashes at runtime.

## Scope (audited surface)

Bun-runtime code that performs file reads/writes:

| Area | Files | Notes |
|---|---|---|
| `apps/daemon/src` | 18 files with read/write call sites (`host/*` 13, `workspace/daemonWorkspacePresenter`, `dispatch/daemonDispatcher`, `version.ts`, `update.ts`, `logging.ts`) | ~140 call sites, overwhelmingly sync |
| `scripts/*.mjs` | 12 files with read/write call sites | Bun-run tooling |

Test infrastructure that must change to unlock the above:

| Area | Change |
|---|---|
| `apps/daemon/test` | 49 unit test files: vitest imports → `bun:test`; 3 files using `vi.hoisted` restructured to `mock.module` |
| `apps/daemon/test/e2e-*.test.ts` | Rename to `e2e-*.ts` so `bun test` does not discover standalone harnesses |
| `apps/daemon/package.json` | `test` script → `bun test`; drop vitest devDependency |
| `apps/daemon/vitest.config.ts` | Delete |

Enforcement:

| Area | Change |
|---|---|
| `scripts/architecture-guard.mjs` | New rule banning `node:fs` read/write APIs in `apps/daemon/src` + `scripts/` with an inline allowlist for documented exceptions |
| `.agents/skills/bun-file-io/SKILL.md` | New skill teaching the runtime boundary and conversion patterns |
| `AGENTS.md` | Short pointer to the file-I/O rules |

## Non-goals

- **No changes to `apps/desktop/src/main`** — Electron main runs Node; `Bun.*` APIs do not
  exist there. It keeps `node:fs` unchanged.
- **No changes to `packages/*`** — shared runtimes (acp-runtime, backend-core,
  skills-runtime, memory-runtime, remote-control-runtime) load in both Electron main and
  the daemon; a runtime-detecting adapter would be a separate goal.
- **No wholesale replacement of `node:fs`** — Bun's own docs recommend keeping `node:fs`
  for `mkdir`, `readdir`, `stat`, `rm`, `rename`, `cp`, `existsSync`, etc. Only read,
  write, append, and delete call sites move to `Bun.file`/`Bun.write`.
- **Desktop/renderer/UI tests stay on vitest** — they target Node (Electron main) and
  jsdom (renderer); `bun test` is not applicable.
- **No behavior changes** — same file formats, same atomicity guarantees, same errors.

## Solution

1. **Test runner first.** Migrate the daemon unit suite to `bun test` so `Bun.*` is
   available in tests without mocks. Verified feasible on this repo: Bun's vitest
   compatibility (`vi` object exported from `bun:test`, official) covers everything the
   suite uses except `vi.hoisted` (3 files). Standalone e2e harness files are renamed so
   `bun test` does not pick them up.
2. **File I/O migration** in `apps/daemon/src` then `scripts/`:
   - `readFileSync(p, "utf-8")` → `await Bun.file(p).text()`
   - `JSON.parse(readFileSync(p, "utf-8"))` → `await Bun.file(p).json()`
   - `readFileSync(p)` (Buffer) → `await Bun.file(p).bytes()` (Uint8Array)
   - `writeFileSync(p, data)` / `fsp.writeFile` → `await Bun.write(p, data)`
   - `await Bun.file(p).delete()` replaces `rmSync`/`unlink` only where the call is
     clearly a file-remove (path-derived) delete
   - Directory APIs (`mkdir*`, `readdir*`, `stat*`, `rename*`, `rm -r`, `cp`, `exists*`)
     stay on `node:fs` per Bun's recommendation.
3. **Sync → async conversion.** `Bun.file`/`Bun.write` are async-only. Sync call sites
   inside already-async flows convert directly. Sync call sites in constructors/module
   init either become lazy `async` accessors or remain `node:fs` sync as a documented
   exception (see allowlist). Atomic patterns are preserved: tmp-file writes move to
   `Bun.write`, the `renameSync` swap stays `node:fs`.
4. **Documented exceptions** (guard allowlist, each with an inline reason):
   - Exclusive-create (`flag: "wx"`) writes — `Bun.write` has no exclusive-create mode.
   - fd-based reads (`openSync` + read loop) where partial header parsing relies on
     positioned reads.
   - Node streams/FileHandle range reads where a `Bun.file().slice()` conversion is not
     clearly equivalent.
5. **Enforcement.** `bun run lint` fails if `apps/daemon/src` or `scripts/` introduce new
   `readFile*`/`writeFile*`/`appendFile*` usage. The skill teaches agents the same rules
   proactively.

## Acceptance

- `bun test` in `apps/daemon` runs the full unit suite green and does not execute the
  e2e harness files.
- `grep -rE "readFile(Sync)?|writeFile(Sync)?|appendFile(Sync)?" apps/daemon/src`
  returns only allowlisted exception sites, each carrying an inline
  `bun-file-io-exception:` comment.
- Same for `scripts/*.mjs` (build-config files `apps/daemon/build.mjs`,
  `apps/desktop/build/**`, and `vite.config.ts` are out of scope).
- `bun run lint` (including the new guard rule) passes.
- `bun run --filter @argos/daemon typecheck` passes.
- `bun run test` (desktop + daemon via turbo) passes; desktop suites unchanged on vitest.
- No `Bun.` usage exists in `apps/desktop/src` or `packages/*` (grep).
