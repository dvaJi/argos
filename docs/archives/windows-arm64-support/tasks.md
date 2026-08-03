# Windows ARM64 Support Tasks

- [x] Add SDD spec, plan, and task tracking.
- [x] Verify Windows ARM64 runtime artifact availability.
- [x] Wire `installRuntime:win:arm64` to explicit `uv`, `node`, and `ripgrep` installation.
- [x] Add CI E2E support for non-provider smoke tests.
- [x] Keep E2E on the default runner profile.
- [x] Add packaged executable process smoke.
- [x] Split interactive E2E from packaged executable process smoke.
- [x] Add Windows ARM64 manual GitHub Actions workflow.
- [x] Enable Windows ARM64 in the manual build workflow.
- [x] Limit Windows ARM64 E2E artifacts to diagnostics.
- [x] Upload app logs, event logs, and native module inventory for Windows ARM64 failures.
- [x] Attach main-process logs directly to E2E test results.
- [x] Upgrade `sharp` to a version with Windows ARM64 optional dependency support.
- [x] Add targeted unit coverage for runtime fallback paths.
- [x] Enable Windows ARM64 in the release workflow after the manual workflow passes on GitHub. DONE:
      the manual `windows-arm64-e2e.yml` workflow passed (latest runs success, 2026-07-27), and
      ARM64 is enabled in `release.yml` (build-windows matrix includes arch=arm64 on
      windows-11-arm; the release job depends on build-windows and merges argos-win-arm64
      artifacts into latest.yml/beta.yml).
