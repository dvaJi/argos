# Daemon Cloud Sync S3 Plan

## Approach

- Add daemon cloud config persistence to `DaemonSyncRuntime` using a JSON file under the daemon config directory.
- Use a daemon-local Bun S3 storage adapter, keeping Bun runtime dependencies out of backend-core and desktop code.
- Keep the daemon local/cloud backup format as `backup-<timestamp>.zip` containing daemon config JSON files.
- Normalize daemon cloud operation results to the shared `CloudSyncResult` shape used by sync routes.

## Data Flow

1. `sync.setCloudConfig` receives config input and stores merged values.
2. `sync.uploadToCloud` calls daemon local backup creation, then uploads the generated zip.
3. `sync.pullFromCloud` downloads the newest daemon backup object into the backup directory, then restores it.
4. `sync.testCloud` runs a ListObjects request through Bun's S3 client.

## Affected Interfaces

- `apps/daemon/src/host/daemonSyncRuntime.ts`
- `apps/daemon/src/host/bunS3CloudStorageService.ts`
- `apps/daemon/src/dispatch/daemonDispatcher.ts`

## Compatibility

- Environment variables can provide or override stored daemon config:
  - `ARGOS_SYNC_S3_ENDPOINT`
  - `ARGOS_SYNC_S3_BUCKET`
  - `ARGOS_SYNC_S3_REGION`
  - `ARGOS_SYNC_S3_PREFIX`
  - `ARGOS_SYNC_S3_ACCESS_KEY_ID`
  - `ARGOS_SYNC_S3_SECRET_ACCESS_KEY`

## Test Strategy

- Add focused daemon runtime tests with a mocked daemon-local cloud service.
- Run formatting, lint, and daemon typecheck.
