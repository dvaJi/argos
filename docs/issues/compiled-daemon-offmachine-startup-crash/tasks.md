# Tasks: compiled daemon off-machine startup crash

- [x] Reproduce locally: hide pdf-parse-new store dir, run built daemon `--version` (crash confirmed, matches CI artifact)
- [x] Rule out pi worker exposure (`argos-pi-worker.exe` has no pdf-parse-new references)
- [x] Patch `pdf-parse-new@2.1.0` eager `require.resolve` with failure tolerance
- [x] Verify fix with off-machine simulation (binary prints version with package hidden)
- [x] Daemon test suite green (423 pass)
- [x] Land fix on `master`
- [x] Re-tag `v0.6.0`, rebuild via Release workflow (twice: once for the patch, once for the daemon version sync)
- [x] Verify downloaded CI daemon runs `--version` on a host without the repo (prints 0.6.0, SHA-256 matches)
- [x] Publish the new draft release with Downloads preamble
