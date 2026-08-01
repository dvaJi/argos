# Windows Release Build Architecture Plan

## Workflow Changes

- Add an explicit `name` to Windows matrix jobs so GitHub Actions does not render every matrix field in the display name.
- Replace Windows x64 `windows-latest` usage with the explicit `windows-2025-vs2026` runner label.
- Expand the release Windows matrix to include arm64 with its own runner and unpacked output directory.
- Copy Windows arm64 release assets from `argos-win-arm64` into `release_assets`.

## Validation

- Run `bun run format`.
- Run `bun run i18n`.
- Run `bun run lint`.
- Inspect workflow references for stale `windows-latest` usage.
