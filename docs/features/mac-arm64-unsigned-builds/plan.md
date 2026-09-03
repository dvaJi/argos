# Plan: Mac Builds — Re-Enable Unsigned (Apple Silicon Only)

## Unsigned path verification (already in place)

| Concern | Mechanism | Status |
|---|---|---|
| Notarization | `scripts/notarize.js` returns early unless `build_for_release` is set | keep env unset |
| App code signing | `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`, no `CSC_LINK` | electron-builder skips identity lookup; arm64 ad-hoc signed |
| CUA helper | `signMacHelperForRelease` returns `false` without `build_for_release` → `adHocSignDarwinHelper` | ad-hoc |
| Plugin integrity | `createDarwinSigningContract` non-distribution → `signatureType: 'ad-hoc'`, no Team ID | passes |
| Gatekeeper assess | `mac.gatekeeperAssess: false` in `electron-builder.yml` | already set |

## Changes

1. **`.github/workflows/build.yml` — `build-mac`**
   - Remove `if: false`; matrix `arch: [arm64]` (keep `platform: mac-arm64`).
   - Env: drop `CSC_LINK`, `CSC_KEY_PASSWORD`, `ARGOS_APPLE_NOTARY_*` and the
     `build_for_release` comment; set `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`
     with an "unsigned build" comment.
   - Keep build order (`plugin:cua:build:mac:arm64` → `plugin:bundle` →
     electron-builder), `plugin:verify` step, and artifact upload as-is.
2. **`.github/workflows/release.yml` — `build-mac`**
   - Same `if`/matrix/env changes (also drop `build_for_release: '2'`).
3. **`.github/workflows/release.yml` — `release`**
   - Add `build-mac` to `needs:` so mac assets are deterministic.

## Test strategy

- YAML parse both workflows.
- `bun run format` + `bun run lint`.
- Behavioral proof lands on first CI run of `Build Application` (workflow_dispatch):
  green `build-mac(arm64)` job producing `argos-mac-arm64` artifacts with
  ad-hoc signed app/helper and no notarization attempts.
