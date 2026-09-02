# Tasks: Mac Builds — Re-Enable Unsigned (Apple Silicon Only)

- [x] **T1** `build.yml` `build-mac`: enable, arm64-only matrix, unsigned env.
- [x] **T2** `release.yml` `build-mac`: enable, arm64-only matrix, unsigned env
      (drop `build_for_release`, CSC/notary secrets).
- [x] **T3** `release.yml` `release`: add `build-mac` to `needs`.
- [x] **T4** Validate: YAML parse + `bun run format` + `bun run lint`.
