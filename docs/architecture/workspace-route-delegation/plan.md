# Plan

## A. Shell presenter

1. Create `apps/desktop/src/main/presenter/workspaceShellPresenter/index.ts`:
   - `export interface WorkspaceShellPresenter { revealFileInFolder(p): Promise<void>; openFile(p): Promise<void> }`
   - `export class ElectronWorkspaceShellPresenter implements WorkspaceShellPresenter`
   - `path.resolve` normalization + `shell.showItemInFolder` / `shell.openPath` with the
     existing error logging semantics. No allowlist (registry moved to daemon), no `node:fs`.

## B. Route delegation (`apps/desktop/src/main/routes/index.ts`)

| Route | Action |
|---|---|
| workspace.register / unregister / watch / unwatch | `invokeDaemonRoute` |
| workspace.readDirectory / expandDirectory | `invokeDaemonRoute` |
| workspace.readFilePreview / resolveMarkdownLinkedFile | `invokeDaemonRoute` |
| workspace.getGitStatus / getGitDiff / searchFiles | `invokeDaemonRoute` |
| workspace.readFileText / writeFile / createEntry / deletePath / renameOrMovePath | `invokeDaemonRoute` |
| workspace.revealFileInFolder / openFile | keep local → `runtime.workspaceShell` |

Also: replace `workspacePresenter: IWorkspacePresenter` with `workspaceShell: WorkspaceShellPresenter`
in the runtime interface + factory wiring; drop the `IWorkspacePresenter` import.

## C. Presenter wiring (`apps/desktop/src/main/presenter/index.ts`)

- Import `ElectronWorkspaceShellPresenter`; construct `workspaceShell` (no `filePresenter` dep).
- Remove `WorkspacePresenter` import + `IWorkspacePresenter` field.

## D. Deletions

- `git rm -r apps/desktop/src/main/presenter/workspacePresenter`
- `git rm apps/desktop/test/main/presenter/workspacePresenter.test.ts`
- `appMain.ts`: remove import (line 8) + call (line 38).
- `protocolRegistrationHook.ts`: remove `WORKSPACE_PREVIEW_PROTOCOL` import + its
  `protocol.handle` block (~line 180). Keep deepcdn/imgcache.

## Verification

```powershell
bun run typecheck:node
bun run lint
bun run format
# desktop suite: failures must stay at baseline 67
bun run --filter @argos/desktop test
# daemon untouched
cd apps/daemon; bun test
rg "node:fs|from \"fs\"" apps/desktop/src/main/presenter/workspaceShellPresenter
rg "workspacePresenter|workspacePreviewProtocol" apps/desktop/src
```
