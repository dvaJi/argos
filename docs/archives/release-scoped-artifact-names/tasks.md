# Tasks: release-scoped-artifact-names

- [x] Reproduce: mac DMG/zip fail (`dist/@argos/` missing); linux writes into the same nested dir.
- [x] Root cause: `${name}` in artifactName expands scoped `@argos/desktop` to a scope subdirectory.
- [x] Fix: literal `argos-${version}-mac|linux-${arch}.${ext}` artifactName templates.
- [x] Align `apps/desktop/package.json` version (0.2.0 → 0.4.0).
- [x] E2E: v0.4.0 release run green with flat `argos-0.4.0-*` assets on all platforms.
- [x] Follow-up: fix or remove `generate-version-files.mjs` (stale asset URLs, unused by CI).
      Done in #90 (`bun run release:sync-version` + corrected URLs matching published assets).
