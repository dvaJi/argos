# Workspace route delegation: desktop shell stops owning workspace file I/O

## Problem

The daemon is the canonical backend (`docs/archives/desktop-daemon-bun-decoupling/spec.md`:
"Desktop is a shell plus transport layer, not a fallback backend"), and the daemon
workspace presenter (`apps/daemon/src/workspace/daemonWorkspacePresenter.ts`) implements
17 of the 19 `workspace.*` route contracts — including HTTP preview URLs that replace
the Electron custom scheme.

The desktop main process nonetheless retains a full second workspace backend:
`apps/desktop/src/main/presenter/workspacePresenter/` (9 files: tree reads, ripgrep
search, git status/diff, watchers, file editing, preview protocol with its own fs
allowlist) wired to the `workspace.*` IPC route handlers in `routes/index.ts`
(lines ~1224–1347). This is duplicated business file I/O in the shell — exactly what
the decoupling spec retired for sessions/skills/mcp/sync/chat.

The renderer already reaches the daemon directly for non-desktop-only routes
(`HybridBridge` → WS; `packages/shared-contracts/src/desktop-only.ts` documents
"workspace.revealFileInFolder" and "workspace.openFile" as the only desktop-only
workspace routes), so the desktop handlers are only reachable as the IPC fallback —
a forbidden second backend path.

## Scope (audited surface)

| Item | Detail |
|---|---|
| `apps/desktop/src/main/routes/index.ts` | 19 `workspace.*` case handlers (~1224–1347): 17 delegate via `invokeDaemonRoute` (same pattern as `sessions.*` at 1602+); `workspace.revealFileInFolder` + `workspace.openFile` stay local (desktop-only routes, Electron `shell`) |
| `apps/desktop/src/main/presenter/workspacePresenter/` | Delete all 9 files (`index.ts`, `directoryReader.ts`, `fileSearcher.ts`, `ripgrepSearcher.ts`, `workspaceFileSearch.ts`, `pathResolver.ts`, `concurrencyLimiter.ts`, `fileSecurity.ts`, `workspacePreviewProtocol.ts`) |
| New `presenter/workspaceShellPresenter/` | Thin shell presenter: `revealFileInFolder` (`shell.showItemInFolder`), `openFile` (`shell.openPath`), path normalization, no `node:fs` |
| `appMain.ts` | Remove `registerWorkspacePreviewSchemes()` import/call (scheme becomes dead: only the deleted presenter produced `workspace-preview://` URLs; renderer has no scheme references) |
| `presenter/lifecyclePresenter/hooks/beforeStart/protocolRegistrationHook.ts` | Remove the `WORKSPACE_PREVIEW_PROTOCOL` `protocol.handle` block (deepcdn/imgcache stay) |
| `apps/desktop/test/main/presenter/workspacePresenter.test.ts` | Delete (25 tests covering removed desktop-side behavior; daemon presenter owns the behavior now) |
| `presenter/index.ts` + `routes/index.ts` runtime type | `workspacePresenter: IWorkspacePresenter` → `workspaceShell: WorkspaceShellPresenter` |

## Non-goals

- No daemon changes — the daemon presenter and its routes already exist and now run
  on `Bun.file`/`Bun.write`.
- No shared-contract changes — route/event contracts are unchanged; `IWorkspacePresenter`
  in `@argos/shared` remains (legacy quarantine types).
- Not in this goal (future goals from the decoupling audit): `knowledge.*` (needs a new
  daemon runtime), electron-store settings in `configPresenter`, desktop agent tool
  FS/bash handlers, `sqlitePresenter` residue.
- Native-only I/O stays in desktop forever by design: dialogs (`filePresenter`,
  `projectPresenter`, `devicePresenter`), `safeStorage` secrets, window state,
  `electron-store` for shell prefs, tray/updater, sidecar supervision.

## Solution

1. Convert the 17 IPC-fallback workspace handlers to one-line
   `route.output.parse(await invokeDaemonRoute(route.name, input))` delegations —
   identical to the existing sessions/skills pattern. With the daemon unreachable
   these now fail with the daemon-unreachable error instead of silently executing a
   second backend, matching the documented constraint "daemon-owned routes must not
   fall back to Electron presenter execution".
2. Introduce `WorkspaceShellPresenter` for the two desktop-only routes. It keeps path
   normalization but drops the desktop-side registered-workspace allowlist: the
   registry lived in the deleted presenter and registrations now land in the daemon
   only. These are user-initiated OS shell actions on paths returned by daemon routes;
   the daemon remains the gatekeeper for every data-bearing route.
3. Delete the second backend and its dead preview protocol.

## Acceptance

- `rg "node:fs|from \"fs\"" apps/desktop/src/main/presenter/workspaceShellPresenter` → no matches.
- `apps/desktop/src/main/presenter/workspacePresenter/` no longer exists;
  `rg "workspacePreviewProtocol|registerWorkspacePreviewSchemes|WORKSPACE_PREVIEW_PROTOCOL" apps/desktop/src` → no matches.
- All 17 delegated `workspace.*` handlers contain no `runtime.workspacePresenter` references.
- `bun run typecheck:node` passes; `bun run lint` passes; `bun run format` clean.
- Desktop test suite failures remain at the pre-existing baseline (67) — the deleted
  `workspacePresenter.test.ts` (25 passing tests) is the only total-test-count change.
- Daemon untouched: `bun test` in `apps/daemon` still 258 pass.
