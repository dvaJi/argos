# Tasks — Daemon CLI Distribution

Ordered. Each maps to a review slice.

## Phase 1 — Publish binaries

- [ ] 1.1 Add `--version` / `-V` flag to `apps/daemon/src/index.ts` (reads daemon `package.json` version).
- [ ] 1.2 In `release.yml` build jobs, stage daemon binary to `dist/daemon/argos-daemon-<os>-<arch>[.exe]` and include it in `upload-artifact`.
- [ ] 1.3 In `release.yml` `release` job, collect `argos-daemon-*` into `release_assets/` and emit `<asset>.sha256`.
- [ ] 1.4 Verify a release run produces downloadable daemon assets (manual dispatch against a test tag).

## Phase 2 — Install scripts

- [ ] 2.1 Create `distro/install/install.sh` (detect OS/arch, resolve latest tag, download, verify sha256, install to `~/.argos/bin`, print PATH hint).
- [ ] 2.2 Create `distro/install/install.ps1` (Windows equivalent).
- [ ] 2.3 Add `test/distro/install.test.ts` covering asset-name + arch mapping for both scripts (mocked).
- [ ] 2.4 Add `distro:check` script (shellcheck + `ruby -c` formula) wired into lint where available.

## Phase 3 — Homebrew tap

- [ ] 3.1 Create `distro/homebrew/Formula/argos-daemon.rb` (on_mac/on_linux blocks, per-arch url+sha256).
- [ ] 3.2 Create `distro/homebrew/README.md` with tap usage.
- [ ] 3.3 Create `scripts/bump-tap.mjs <version>` (read release sha256s, rewrite formula, push to `dvaJi/homebrew-tap`).
- [ ] 3.4 Add `distro:bump-tap` script to root `package.json`.
- [ ] 3.5 Unit-test the formula rewrite (fixture formula + fake payload) in `test/distro/bump-tap.test.ts`.
- [ ] 3.6 Create the `dvaJi/homebrew-tap` repo and push the initial formula manually.

## Phase 4 — Landing page

- [ ] 4.1 Update `apps/landing/src/components/Hero.tsx`: replace cask command with `brew install dvaJi/tap/argos-daemon` (+ Windows note).
- [ ] 4.2 Update `apps/landing/src/components/Download.tsx`: show per-OS install commands; keep desktop download cards on GitHub Releases.
- [ ] 4.3 Add a short "Run headless" subsection linking to the daemon docs/commands.

## Phase 5 — Wrap-up

- [ ] 5.1 `pnpm run format && pnpm run i18n && pnpm run lint`.
- [ ] 5.2 Update `docs/features/landing-page-app` cross-references if it mentions the cask.
- [ ] 5.3 Document the maintainer release step (run `distro:bump-tap` after publish) in `docs/release-flow.md`.
