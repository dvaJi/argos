# Plan: release-scoped-artifact-names

## Approach

1. `apps/desktop/electron-builder.yml`
   - `mac.artifactName`: `${name}-${version}-mac-${arch}.${ext}` →
     `argos-${version}-mac-${arch}.${ext}`
   - `linux.artifactName`: `${name}-${version}-linux-${arch}.${ext}` →
     `argos-${version}-linux-${arch}.${ext}`
2. `apps/desktop/package.json`: `version` 0.2.0 → 0.4.0.

No workflow changes: release job asset globs are extension-based
(`*.dmg`, `*.zip`, `*.AppImage`, `*.tar.gz`, `*.exe`, `*.yml`, `*.blockmap`)
and daemon staging uses its own `dist/daemon/` paths.

## Verification

- `bun run --filter @argos/desktop packaging:validate` (parses the YAML).
- E2E: re-tagged v0.4.0 release run — `build-mac (arm64)` green, and the
  release job's `ls -la release_assets/` shows mac + linux assets at the top
  level with `argos-0.4.0-*` names.
