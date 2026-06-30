# Workspace Onboarding Plan

## Approach

Create a reusable `RemoteWorkspaceSetup` component under the main renderer components tree. It will combine onboarding copy, daemon install/run command blocks, token/security guidance, and the remote workspace form.

## Affected Files

- `apps/desktop/src/renderer/src/components/workspace/RemoteWorkspaceSetup.tsx`: new reusable setup experience.
- `apps/desktop/src/renderer/src/components/WorkspaceSelector.tsx`: replace the bare add dialog content with the setup component.
- `apps/desktop/src/renderer/settings/components/ServerSettings.tsx`: replace the duplicated add form with the setup component.
- `docs/features/workspace-onboarding/*`: SDD artifacts.

## Data Flow

- The setup component owns temporary input state and validates the daemon via `GET {url}/health`.
- On valid health response, it calls an `onAddWorkspace` callback with name, normalized URL, token, and daemon version.
- The selector callback uses `workspaceStore.addWorkspace` and can switch/close the dialog.
- Settings callback writes through `workspaceConfig` helpers, preserving current persistence behavior.

## UI Direction

Use an operator-oriented layout: left side explains the setup path and daemon requirements; right side contains the connection form and status. In the selector dialog, this appears as a wider guided dialog. In settings, it appears as an embedded panel.

## Validation

- `pnpm run format`
- `pnpm run i18n` if available
- `pnpm run lint`
- Focused typecheck/build command if needed for renderer changes