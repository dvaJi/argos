# Plan: CI Actions Storage Over-Quota

## Approach

Three independent remediations — two are one-time cleanups (API operations),
one is a workflow change to prevent recurrence.

### Remediation A — Delete stale build artifacts (one-time)

Delete all 7 active artifacts (IDs 8025750325–8027414149) via the GitHub
Actions API. These are release-build outputs from Jul 2 that have already been
consumed. Frees ~2.5 GB.

### Remediation B — Delete orphaned cache entries (one-time)

Delete:
- All 25 caches scoped to `refs/heads/refs/tags/v0.1.0` (~6.7 GB) —
  unrecoverable scope due to the platform bug; harmless to delete.
- All caches scoped to `refs/pull/{13..28}/merge` (~340 MB) — merged PRs;
  their cache scopes are closed and will never be restored again.

Keep:
- All `refs/heads/master` caches (~2.5 GB) — active branch, still useful.

Total freed: ~9.5 GB.

### Remediation C — Stop Turbo local-cache churn (workflow fix)

In `.github/actions/setup-build/action.yml`, remove `${{ github.sha }}` from
the Turbo cache `key` so that the same lockfile hash reuses one entry
(overwrite-on-save) instead of spawning a unique entry per commit.

**Before:**
```
key: turbo-v2-${{ hashFiles(...) }}-${{ github.sha }}
restore-keys: |
  turbo-v2-${{ hashFiles(...) }}-
  turbo-v2-
```

**After:**
```
key: turbo-v2-${{ hashFiles(...) }}
restore-keys: |
  turbo-v2-
```

Rationale: the remote Turbo cache (configured via `TURBO_API`/`TURBO_TOKEN`)
already provides per-commit content-addressable deduplication. The local
actions/cache is only a fallback for cold runs; keying it by lockfile hash is
sufficient and bounded (one entry per lockfile change, not per commit).

### Remediation D — Auto-expire artifacts (workflow hardening)

Add `retention-days: 7` to the `upload-artifact` steps in `build.yml` and
`release.yml` so future build artifacts self-delete instead of lingering for
90 days. Release-published artifacts are uploaded to GitHub Releases (not
Actions artifacts), so the Actions copies are ephemeral build evidence only.

## Verification

- `gh api repos/dvaJi/argos/actions/cache/usage` shows
  `active_caches_size_in_bytes` well under 0.5 GB after cleanup.
- Next CI run observes a cache hit on the Turbo fallback (lockfile-keyed).
- `actions: write` permission available for cache deletion (repo owner token).

## Risk

- Deleting `refs/heads/refs/tags/v0.1.0` caches: none — the scope is orphaned,
  no workflow run can restore from it.
- Turbo key change: next run may miss cache once (cold Turbo local fallback),
  but remote cache still applies. Negligible slowdown.
- `retention-days: 7`: if a release's Actions artifacts are needed >7 days
  later for debugging, they must be re-downloaded from GitHub Releases
  instead. Acceptable — Release assets are the canonical copy.
