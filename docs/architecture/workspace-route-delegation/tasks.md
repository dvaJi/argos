# Tasks

- [x] **A1** Create `workspaceShellPresenter` (reveal/open via Electron shell, no fs)
- [x] **B1** Convert 17 workspace IPC handlers to `invokeDaemonRoute` delegation
- [x] **B2** Keep reveal/open local; retype runtime field to `workspaceShell`
- [x] **C1** Rewire `presenter/index.ts` construction
- [x] **D1** Delete `presenter/workspacePresenter/` (9 files)
- [x] **D2** Delete `test/main/presenter/workspacePresenter.test.ts`
- [x] **D3** Remove preview scheme registration (`appMain.ts`, `protocolRegistrationHook.ts`)
- [x] **E1** typecheck:node, lint, format green; desktop tests at baseline 67; daemon bun test 258 pass

## Deviation from plan

1. `packages/shared/src/types/presenters/legacy.presenters.d.ts`: removed the now-unused
   `workspacePresenter: IWorkspacePresenter` field from `IPresenter` (no remaining
   consumers anywhere; plan had listed shared-contract changes as a non-goal, but this
   is a type-only cleanup required to compile — the `IWorkspacePresenter` interface
   itself remains untouched).
2. `test/main/routes/dispatcher.test.ts`: the phase3 route test still dispatches
   workspace routes, so it was updated to the delegation architecture —
   `vi.mock("#/routes/daemonRouteProxy")` with a fixture map for workspace routes
   (unregistered routes fall through to the real proxy, preserving the
   daemon-unreachable behavior other suites rely on), and `workspaceShell` mocks for
   reveal/open. The test previously asserted the removed local presenter and would
   otherwise have been the one net-new desktop failure.

