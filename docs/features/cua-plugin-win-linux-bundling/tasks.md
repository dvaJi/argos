# Tasks: CUA Plugin — Bundle Into Windows & Linux Builds

- [x] **T1** Add `plugin:cua:build:win:x64`, `plugin:cua:build:win:arm64`,
      `plugin:cua:build:linux:x64` npm scripts (`package.json`).
- [x] **T2** Wire CUA build + bundle into `build:win`, `build:win:x64`,
      `build:win:arm64`, `build:linux`, `build:linux:x64`; leave
      `build:linux:arm64` unbundled (unsupported upstream target).
- [x] **T3** `build.yml`: add CUA build + bundle to `build-windows` /
      `build-linux`; add post-pack `plugin:verify` steps.
- [x] **T4** `release.yml`: same changes for its windows / linux jobs.
- [x] **T5** `bun run format` + `bun run lint`.
