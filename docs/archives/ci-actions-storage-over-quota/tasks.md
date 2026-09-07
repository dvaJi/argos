# Tasks: CI Actions Storage Over-Quota

## Done

- [x] SDD spec + plan authored (`docs/issues/ci-actions-storage-over-quota/`)
- [x] Remediation A — Deleted 7 stale build artifacts (~2.5 GB)
- [x] Remediation B — Deleted 62 orphaned caches: malformed-ref `refs/heads/refs/tags/v0.1.0` (25, ~6.7 GB) + merged-PR refs #13–#28 (~340 MB) + duplicate pnpm-store on master (886 MB)
- [x] Remediation C — Removed `github.sha` from Turbo cache key in `setup-build/action.yml`
- [x] Remediation D — Added `retention-days: 7` to all 6 `upload-artifact` steps in `build.yml` + `release.yml`
- [x] Verified: cache usage dropped from ~10 GB → 1.63 GB (11 active caches, all master)

## Todo

- [x] Lint guard pass
- [x] Open PR
      (Both closed 2026-09-06: remediations verified present on `master` —
      `retention-days: 7` ×6 in `build.yml`/`release.yml`, no `github.sha` in
      the turbo cache key — and repo lint is green. The remediation commits
      landed directly on `master`.)
