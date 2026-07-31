# Daemon Cloud Sync S3

## User Need

Headless daemon users need to back up and restore daemon configuration through S3-compatible object storage so config can move across machines without the desktop app.

## Goal

Replace daemon cloud sync stubs with working S3-compatible upload, download, credential persistence, and credential test behavior.

## Acceptance Criteria

- Daemon sync routes expose current cloud config without leaking `secretAccessKey`.
- `sync.setCloudConfig` persists S3-compatible config in daemon JSON storage.
- `sync.testCloud` validates the configured bucket/prefix through a daemon-local Bun S3 service.
- `sync.uploadToCloud` creates a daemon zip backup and uploads it to S3-compatible storage.
- `sync.pullFromCloud` downloads the latest cloud backup and restores daemon config files.
- Missing or incomplete cloud configuration returns a structured failure result.

## Constraints

- Keep daemon backup archive format focused on daemon JSON config files.
- Do not introduce Electron dependencies into daemon code.
- Store secrets in daemon JSON config for now, while supporting environment overrides for headless use.
- Use Bun's native S3 runtime API in daemon code.

## Non-Goals

- Desktop UI changes.
- Encrypted daemon secret storage.
- Automatic scheduled cloud sync.

## Open Questions

None.
