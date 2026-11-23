# MCP Roots

## User Need

MCP servers with the roots capability ask the client which filesystem directories are exposed (`roots/list`, client capability `roots: { listChanged }`). Argos never advertised roots, so workspace-aware servers could not discover the workspace.

## Goal

Advertise `roots: { listChanged: false }` and answer `roots/list` with the server's own working directory as the single `file://` root (stdio servers only — remote servers have no cwd and return an empty list).

## Acceptance Criteria

1. Client capabilities include `roots: { listChanged: false }`.
2. `ListRootsRequestSchema` handler returns `[{ uri: "file://<cwd>", name: basename(cwd) }]` when the server config carries a cwd; `[]` otherwise.
3. Unit tests cover both cases; typecheck/lint/format/tests pass.

## Non-Goals

- Multi-root workspaces / `listChanged` notifications (server cwd only, for now).
- Additional-directories surfacing.
