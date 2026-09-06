# Plan: release-version-sync

## Approach

1. `scripts/sync-release-version.mjs` (bun-run; `Bun.file`)
   - Read root `package.json` → release version (source of truth).
   - Verify `CHANGELOG.md` contains `## v<version> (YYYY-MM-DD)`.
   - Apply the version to `apps/desktop/package.json` (preserve 2-space JSON
     formatting + trailing newline).
   - `--check`: verify only, exit 1 on drift with actionable messages.
2. `package.json`: `release:sync-version` script.
3. `.github/workflows/release.yml` preflight: run
   `bun scripts/sync-release-version.mjs --check` before building so a stale
   desktop version or missing changelog section fails fast.
4. `apps/desktop/build/generate-version-files.mjs`: generate URLs that match
   the actual published asset names (`argos-<v>-windows-<arch>.exe`,
   `argos-<v>-mac-<arch>.dmg`, `argos-<v>-linux-x86_64.AppImage`).
5. `docs/release-flow.md`: step 1 runs the sync command when bumping.

## Verification

- `bun scripts/sync-release-version.mjs --check` green on a synced tree.
- Temporarily drift `apps/desktop` version → `--check` exits 1 with a clear
  message; sync mode repairs it.
- `bun run format` + `bun run lint`.
