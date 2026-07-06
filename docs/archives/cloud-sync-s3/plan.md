# Plan: Cloud Sync (S3-compatible Object Storage)

## Architecture Overview
Cloud capability acts as an overlay layer on top of the existing backup pipeline, without rewriting local backup/import:

```text
DataSettings.vue ─► sync store ─► SyncClient ─► [route] ─► SyncPresenter ─► CloudStorageService
  save / test / upload / pull                                           │                      │
                                                        ConfigPresenter          R2 / S3 bucket
                                                     (safeStorage encrypts credentials)
```

- Upload = take the latest local zip (`SyncPresenter.listBackups()`) → `CloudStorageService.uploadBackup()`.
- Pull = `CloudStorageService.downloadLatest()` lands in the sync folder → reuses `SyncPresenter.importFromSync()`.

## Key Files
- `src/main/presenter/syncPresenter/cloudStorageService.ts` (new): S3 client wrapper
  (`forcePathStyle: true`, `region` defaults to `auto`), with methods `testConnection / uploadBackup /
  listRemoteBackups / downloadLatest`, following the `backup-\d+\.zip` filename convention.
- `src/main/presenter/syncPresenter/index.ts`: adds `testCloudConnection / uploadLatestBackupToCloud /
  pullLatestBackupFromCloud`, which build the service from the decrypted `ResolvedCloudSyncConfig` provided by ConfigPresenter.
- `src/main/presenter/configPresenter/index.ts`: `getCloudSyncConfig / setCloudSyncConfig /
  getResolvedCloudSyncConfig / isCloudSafeStorageAvailable`; the secret is encrypted via `safeStorage`,
  and the view is redacted (exposes only `hasSecret`).
- `src/shared/contracts/routes/sync.routes.ts` + `routes.ts`: adds 5 routes and registers them.
- `src/main/routes/index.ts`: adds 5 dispatch cases under the sync section (upload/pull reuse `recordSettingsActivity`).
- `src/shared/types/presenters/legacy.presenters.d.ts`: new methods on `ISyncPresenter` / `IConfigPresenter` plus
  `CloudSyncConfigView / CloudSyncConfigInput / ResolvedCloudSyncConfig / CloudSyncResult` types.
- `src/renderer/api/SyncClient.ts` + `src/renderer/src/stores/sync.ts`: 5 client methods + store action.
- `src/renderer/settings/components/DataSettings.vue`: new cloud sync block inside the sync card.
- i18n: `sync.json` (success/error cloud keys), `settings.json` (`data.cloudSync.*`), filled in for all languages.

## Reuse
- Backup/import: `performBackup / importFromSync / listBackups / getBackupsDirectory`.
- Encryption: `safeStorage` (see `databaseSecurityPresenter`).
- IPC / renderer data flow: `defineRouteContract`, `useIpcQuery/useIpcMutation`, pinia store.

## Dependencies
- Adds `@aws-sdk/client-s3` (same source as existing `@aws-sdk/client-bedrock`).

## Boundaries and Decisions
- R2 requires path-style + `region: 'auto'`.
- A blank secret means do not modify the existing value; re-encrypt and write only when non-blank.
- When saving config, finish encrypting the secret first, then write the local settings; if the second step fails, roll back the written secret to avoid a mismatch between the access key and the stale secret.
- Cloud upload only accepts `backup-\d+\.zip` files with an importable structure, preventing arbitrary user zips from being synced to the cloud.
- Activity records reuse the existing `backup_created` / `imported` actions without extending the schema (minimal change).
