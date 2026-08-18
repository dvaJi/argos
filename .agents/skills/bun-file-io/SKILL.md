---
name: bun-file-io
description: Use Bun's native file I/O (Bun.file/Bun.write) correctly in Argos Bun-runtime code. Use when writing or reviewing file read/write code in apps/daemon or scripts/, adding tests for daemon code, deciding between Bun.file and node:fs, or when the architecture-guard bun-file-io rule fails.
---

# Bun Native File I/O

## Overview

Argos runs two JS runtimes. File I/O rules differ per runtime, and using the wrong
API either crashes (Bun APIs in Electron) or leaves performance on the table
(`node:fs` reads/writes in the daemon).

| Code | Runtime | File read/write |
|---|---|---|
| `apps/daemon/src`, `scripts/*.mjs` (bun-run) | Bun | **`Bun.file()` / `Bun.write()`** |
| `apps/desktop/src/main` | Electron's Node | `node:fs` only — never `Bun.*` |
| `packages/*` shared runtimes | Both | `node:fs` only — never `Bun.*` (enforced by architecture-guard) |
| `packages/ui`, renderers | Browser | No fs access |

## Conversion Patterns

| node:fs | Bun |
|---|---|
| `readFileSync(p, "utf-8")` | `await Bun.file(p).text()` |
| `JSON.parse(readFileSync(p, "utf-8"))` | `await Bun.file(p).json()` |
| `readFileSync(p)` (Buffer) | `await Bun.file(p).bytes()` (Uint8Array) |
| `writeFileSync(p, data)` / `(await fs).writeFile(p, data)` | `await Bun.write(p, data)` |
| positioned partial read (`fsp.open` + `handle.read`) | `await Bun.file(p).slice(0, n).bytes()` |
| `unlink(p)` for a plain file | `await Bun.file(p).delete()` |

Keep on `node:fs` — Bun's own recommendation — for **directory** operations:
`mkdir`, `readdir`, `stat`, `lstat`, `rm` (recursive), `rename`, `cp`, `copyFile`,
`existsSync`, `realpath`, `chmod`, atomic `rename`-based swaps (write tmp via
`Bun.write`, rename via `fs.renameSync`).

`Bun.write` accepts `string | Blob | ArrayBuffer | TypedArray | Response` and
`Bun.file(p).json()` parses JSON. `Buffer.from(await Bun.file(p).bytes())` where
Buffer methods are genuinely needed.

## Archives (fflate vs Bun.Archive)

`Bun.Archive` (available since Bun 1.3.6) handles **tar/tar.gz only** — it throws
"Unrecognized archive format" on ZIP. Every `fflate` use in this repo handles ZIP,
so **fflate stays**:

- `.dcplugin` plugin/skill packages — container format written by bun scripts and
  read by both the daemon (Bun) and desktop (Node). Cross-runtime contract.
- Sync backups (`backup-*.zip`) — read/written by both `daemonSyncRuntime` and the
  desktop `SyncPresenter`; users have existing zips on disk.
- pptx/odt file adapters — OOXML/ODF are ZIP containers by specification.

Do not convert these to `Bun.Archive`, and do not migrate the container formats to
tar without a cross-version compatibility plan for on-disk artifacts. Shared
packages (`skills-runtime`, `acp-runtime`) additionally cannot use `Bun.*` at all;
their tar extraction path (`acpLaunchSpecService`) uses system `tar` with manual
entry validation and stays that way unless the daemon injects an archive port.

## Runtime utilities (probed on Bun 1.3.14)

Adopted: `Bun.sleep` (daemon + scripts sleeps), `Bun.which` (tool presence probes,
replaces `where`/`which` + `spawnSync`), `Bun.YAML.parse` (script config parsing).
Optional but not adopted: `Bun.CryptoHasher` (6 sha256 sites produce identical
digests via `node:crypto` — swap is pure cosmetics), `Bun.Glob` (could replace
hand-rolled recursive walks in guard scripts; churn > value while guards are
stable).

Available but no usable site: `Bun.JSON5` (zero JSON5/JSONC usage; `jsonrepair`
in mcp-runtime is a shared package with different repair semantics),
`Bun.semver` (only Bun-runtime site is in shared mcp-runtime), `Bun.TOML`,
`Bun.password`, `Bun.color`, `Bun.stringWidth`, `Bun.deepEquals`, `Bun.inspect`,
global `HTMLRewriter`, `Bun.Image` (no equivalent for sharp's `composite`/`gif`/
`mozjpeg` in the image route — keep sharp).

Not present in Bun 1.3.14 (docs describe newer runtimes — do not use):
`Bun.encodeBase64`/`decodeBase64` (keep `Buffer.from(...).toString("base64")`),
`Bun.XML`, `Bun.Markdown`, `Bun.csrf`, `Bun.JSON`, `Bun.nanoid`/`randomUUID`
(use the `crypto.randomUUID()` global).

## Other Bun APIs (spawn / Shell / cron / Webview)

Audited 2026-08 (Bun 1.3.14 pinned). Do not migrate these without a new spec:

- **`Bun.spawn`** — optional, low value. Only 3 daemon files use `node:child_process`
  (`daemonWorkspacePresenter` git ops, `daemonPluginPresenter` helper probes,
  `pi-provider-execution` pi worker). All are argv-array + async already. The pi
  worker's stdin/stdout readline protocol would need a ReadableStream rewrite, and
  `promisify(execFile)` timeouts/maxBuffer semantics would be re-wrapped by hand.
  Shared packages (`acpProcessManager`, `shellEnv`, `processTree`) keep
  `node:child_process` — `Bun.*` is forbidden there.
- **Bun Shell (`$`)** — no use. The daemon builds no shell strings (everything is
  argv-array; that's the injection-safe pattern Bun.Shell itself recommends). The
  genuinely hairy shell construction (`shellEnv.ts` POSIX fallbacks, PowerShell
  bootstrap) lives in shared packages where Bun APIs are not allowed.
- **`Bun.cron`** — do not use on Bun 1.3.x. Verified on the pinned runtime:
  `Bun.cron.parse("0 9 * * *")` interprets the schedule in **UTC** (the
  local-time behavior in Bun's docs is v1.4+), while Argos scheduled tasks promise
  local wall-clock times — tasks would fire hours off. Additionally the scheduler
  (`backend-core/src/scheduled`) uses structured `once`/`daily`/`weekly` triggers
  with persisted `lastFiredAt` and startup backfill, not cron expressions, and it
  lives in a shared package. Keep the `setTimeout`-chained service.
- **`Bun.Webview`** — not applicable. It does not exist in Bun 1.3.14, and it is a
  *headless browser automation* API (scraping/testing), not a windowing system.
  All Argos windowing is Electron `BrowserWindow`/`WebContentsView` in the desktop
  shell; the daemon is headless by design.

## Documented Exceptions

Sync-bound call sites may keep `node:fs` with a `bun-file-io-exception: <reason>`
comment — either on the call line / line above, or next to the `node:fs` import
for a whole file. The `bun-file-io` lint rule (in `scripts/architecture-guard.mjs`)
enforces this; it fails `bun run lint` on unannotated read/write usage in
`apps/daemon/src` and bun-run scripts.

Current exceptions (each has an inline reason in the file):

- `jsonStoreFactory.ts`, `daemonSkillRuntime.ts` state store — sync `StoreLike`-style
  ports from shared packages.
- `daemonConfigPresenter.ts` — sync constructor load + sync setters.
- `piAgentProfileManager.ts` — sync API with sync-chained internals.
- `environment-identity.ts` — exclusive-create `wx` writes (`Bun.write` has no
  exclusive-create flag) + sync startup call.
- `acpBinaryGuard.ts` — repeated positioned fd reads.
- `localUsageScanner.ts` — sync parse/scan API surface.
- `version.ts` — sync module-init fallback.
- `scripts/afterPack.js`, `scripts/notarize.js` — electron-builder hooks that run
  under Node; excluded from the rule.
- `scripts/sign-cua-helper.mjs` — imported in-process by desktop vitest (Node) to
  mock `child_process`; must stay Node-compatible.

## Daemon Tests

Daemon unit tests run on `bun test` (not vitest). `bun:test` exports a vitest-compatible
`vi` object, but these have **no** Bun equivalent — use the noted workaround:

- `vi.hoisted`/`vi.mock(mod, factory)` → top-level `mock.module(mod, factory)` with
  plain `vi.fn()` holders declared above it.
- `vi.stubEnv`/`vi.unstubAllEnvs` → manual `process.env` save/restore.
- `vi.stubGlobal`/`vi.unstubAllGlobals` → manual global save/restore helper.
- `it.runIf(cond)` → `it.if(cond)`.
- `it.skipIf(cond)` → `it.skipIf` exists; prefer `it.if(!cond)`.

TypeScript 6/7 note: `@types/bun` is not auto-discovered; `apps/daemon/tsconfig.json`
must keep `"types": ["bun"]`.

## Workflow

1. Identify the runtime of the file you are touching (see table above).
2. In Bun-runtime code, convert reads/writes with the pattern table; keep directory
   ops on `node:fs`.
3. Sync-bound code: add a `bun-file-io-exception:` comment with a real reason —
   do not convert call chains that would force async through sync contracts.
4. Verify: `bun test` in `apps/daemon`, `bun run lint` (runs the `bun-file-io` rule),
   `bun run --filter @argos/daemon typecheck`.

## Response Rules

- Never introduce `Bun.*` into `apps/desktop/src` or `packages/*` — the architecture
  guard fails the build on this.
- Never add new `readFileSync`/`writeFileSync`/`fs.readFile`/`fs.writeFile` to
  `apps/daemon/src` or bun-run scripts without a `bun-file-io-exception` comment.
- When a lint failure mentions `[bun-file-io]`, convert the call or justify the
  exception — do not silence the rule.

## Examples

Activate this skill for requests like:

- "Read this JSON config in the daemon" → `await Bun.file(p).json()`
- "Save the backup archive" → `await Bun.write(target, zipSync(entries))`
- "The bun-file-io guard failed on my change"
- "Add a daemon unit test" → `import { describe, it, expect, vi } from "bun:test"`
