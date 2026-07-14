# Daemon backup folder

## User need

The Data & Privacy backup action must create a backup in the selected Sync Folder and report failures instead of appearing to do nothing.

## Goal

Make daemon-backed local backups honor the shared sync-folder setting, keep the native Open Folder action aligned with that path, and expose backup errors in the UI.

## Acceptance criteria

- `sync.startBackup` writes into the configured Sync Folder in daemon mode.
- Listing, restoring, cloud upload, and cloud download use that same folder.
- An empty configured path falls back to the daemon-managed backup directory.
- Open Sync Folder opens the path currently shown in Data & Privacy.
- Backup failures produce a destructive toast with the backend error.
- A successful backup still refreshes the list and shows its timestamp and size.

## Constraints

- Preserve the existing ZIP format and config-file restore behavior.
- Keep folder opening as a desktop-native operation.
- Do not read or mutate a live SQLite database as part of this focused fix.

## Non-goals

- Redesigning cloud sync.
- Expanding the current daemon backup format to restore SQLite session data.

## Open questions

None.
