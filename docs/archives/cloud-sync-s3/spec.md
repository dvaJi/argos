# Spec: Cloud Sync (S3-Compatible Object Storage)

## Background and Problem
Argos's existing "sync" only packages the database + configuration as `backup-<timestamp>.zip` and writes it to a **local** sync folder (default `~/ArgosSync`); import likewise only reads from that local folder. Data does not flow automatically between multiple devices (home / office); you must manually carry the zip.

## Goals
Layer a minimal cloud capability **without changing** the existing local backup/import logic:
1. **Upload to cloud**: push the latest local backup zip to an S3-compatible object storage.
2. **Pull latest from cloud**: download the latest cloud backup zip to the local sync folder, reusing the existing import flow to restore.

The primary use case is Cloudflare R2, implemented via the **S3-compatible protocol**, so the same configuration can also connect to MinIO / AWS S3 / B2.

## Non-Goals (Explicitly Out Of Scope To Avoid Over-Engineering)
- No scheduled/automatic upload; purely manual button trigger.
- No cloud multi-version management, retention policies, or conflict merging.
- No WebDAV / R2 proprietary Token API.
- No new import merge semantics; reuse existing increment / overwrite.

## User Story
- As a multi-device user, I click "Upload to cloud" on machine A and "Pull latest from cloud" on machine B to bring my chat history and configuration over.

## Acceptance Criteria
- Settings → Data shows a "Cloud Sync (S3-Compatible)" section: endpoint / bucket / region / prefix / AK / SK + save / test connection / upload / pull.
- After entering valid R2 credentials, "Test Connection" succeeds; after "Upload to cloud", `argos-backups/backup-*.zip` appears in the bucket.
- After "Pull latest from cloud" on another device, data is restored.
- `secretAccessKey` is stored encrypted with safeStorage in `app-settings`; the renderer never receives the plaintext.
- The same UI can connect to MinIO by switching endpoint/bucket (verifying S3 compatibility).

## Security
- Credential secrets are encrypted with Electron `safeStorage` before being written to disk (consistent with `databaseSecurityPresenter`).
- When safeStorage is unavailable, refuse to save the secret and prompt (`sync.error.safeStorageUnavailable`).

## Open Questions
- None (approach, credential storage, and trigger method have all been confirmed with the user).
