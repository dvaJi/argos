# Tasks: Cloud Sync (S3-Compatible Object Storage)

- [x] Install `@aws-sdk/client-s3` dependency
- [x] Add `CloudStorageService` (testConnection / uploadBackup / listRemoteBackups / downloadLatest)
- [x] `ConfigPresenter`: add cloud credential read/write; encrypt secrets with safeStorage and mask in views
- [x] `SyncPresenter`: add testCloudConnection / uploadLatestBackupToCloud / pullLatestBackupFromCloud
- [x] Add 5 IPC route contracts and register them in `routes.ts`
- [x] `legacy.presenters.d.ts`: add interface methods and CloudSync* types
- [x] `main/routes/index.ts`: register 5 cases
- [x] `SyncClient.ts` + `stores/sync.ts`: add cloud methods/state
- [x] `DataSettings.vue`: cloud sync UI (form + save/test/upload/pull)
- [x] i18n: add cloud keys for zh-CN / en-US; other languages fall back to English; `pnpm run i18n` passes
- [x] PR review: cloud config write failures are observable and roll back the secret
- [x] PR review: cloud upload/download switched to streaming IO
- [x] PR review: validate backup package structure before upload; skip forged zips
- [x] PR review: roll back if local settings read fails during import
- [x] PR review: add busy guards for cloud operations
- [x] PR review: localize he-IL / id-ID cloud sync copy
- [x] Wrap-up: `pnpm run typecheck` / `format` / `lint` all green

## Pending Manual Verification (requires real R2 credentials)
- [ ] Fill in R2 credentials → test connection succeeds
- [ ] Upload to cloud → `argos-backups/backup-*.zip` appears in the bucket
- [ ] Pull latest on another device → data is restored
- [ ] Switch MinIO endpoint to verify S3 compatibility
- [ ] Confirm the secret in `app-settings` is stored as ciphertext
