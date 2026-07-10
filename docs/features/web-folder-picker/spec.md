# Web-mode Folder Picker — Specification

## Goal

Let users pick a filesystem folder from the web UI (daemon-served) — for default
project paths, MCP command paths, skill folders, sync folders, agent workdirs,
etc. — so the "Browse" affordances that currently hit desktop-only routes
(`project.selectDirectory`, `dialog.*`, `skills.openFolder`, `sync.openFolder`)
stop throwing "not available in headless mode" and actually work in the browser.

## Background / Problem

The host filesystem is only visible to the **daemon**. Browsers cannot enumerate
real paths (the File System Access API returns opaque handles, not server paths).
So a web folder picker must **browse via the backend**: the user navigates by
typing a path and stepping through the subdirectories the daemon lists. This is
the model [t3code](https://github.com/pingdotgg/t3code)'s web app uses
(`CommandPalette` text input → `filesystemEnvironment.browse` backend call).

Today Argos uses Electron's native dialog (`dialog.showOpenDialog`) via
desktop-only routes; in web mode these throw.

## Approach

1. **Route** `workspace.browseDirectory` (`shared-contracts/.../workspace.routes.ts`):
   input `{ path? }` (default home; expands `~`), output
   `{ path, parent, home, separator, entries: [{ name, path, isDirectory }] }`.
   Daemon handler reads `node:fs.readdirSync`, returns directories only
   (non-hidden), sorted. Unreadable paths fall back to home so the picker never
   dead-ends.
2. **Client** `workspaceClient.browseDirectory(path?)` (`WorkspaceClient.ts`).
3. **Component** `FolderPicker` (`src/components/FolderPicker.tsx`): a Popover
   with a path text input (type/paste + Enter to browse), Home/Up navigation, a
   scrollable directory listing to drill into, and a Select confirm. Controlled
   `{ value, onChange }` — drop-in for any path field.
4. **Wiring**: replaced the `project.selectDirectory()` Browse button on the
   Argos Agents "Default project path" field with `<FolderPicker>`. The same
   pattern applies to the other ~9 call sites (skills, MCP, sync, workspace) —
   incremental follow-up.

## Acceptance Criteria

- `/#/settings/argos-agents` → "Default project path" Browse opens a folder
  picker that navigates the daemon's real filesystem and writes a real path.
- No `[WebBridge]`/`not available in headless mode` errors for folder picking.
- Desktop still works (the component works against the daemon there too; the
  native dialog can remain an optional enhancement).

## Non-Goals

- A full file-tree/explorer (directories only, for path selection).
- Migrating every `selectDirectory` call site in one pass (the component + route
  are reusable; sites adopt incrementally).
- File System Access API (opaque handles don't give the daemon a real path).
