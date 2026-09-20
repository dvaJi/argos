# Plan: compiled daemon off-machine startup crash

## Approach

Minimal `patchedDependencies` patch on `pdf-parse-new@2.1.0` — the only package
whose module evaluation performs an unembeddable eager `require.resolve`.

## Steps

1. `bun patch pdf-parse-new@2.1.0`; wrap the eager
   `require.resolve('./lib/markdown-render-page.js')` in `index.js` with a
   try/catch that falls back to `null`; commit the patch
   (`patches/pdf-parse-new@2.1.0.patch`).
2. Rebuild the daemon and verify with the off-machine simulation (hide the
   pdf-parse-new store dir, run `--version`).
3. Confirm no behavioral change on normal runtimes (`require.resolve` still
   returns the real path) and that the pi worker binary has no
   `pdf-parse-new` exposure.
4. Run daemon tests, format, lint, typecheck.
5. Land on `master`, re-tag `v0.6.0`, rebuild via the Release workflow, and
   verify the new draft artifacts by running the downloaded daemon on a host
   without the repo.

## Rejected alternatives

- **Side-effect import of the shim** (`import "pdf-parse-new/lib/markdown-render-page.js"`):
  bundler emits an unresolved relative require; binary fails even on the build
  machine.
- **`--external pdf-parse-new` + ship node_modules**: packaging churn across
  every platform job and the electron bundle.
- **Migrate off pdf-parse-new**: out of scope for a release-blocking fix.

## Risks

- Patch maintenance on dependency bumps: `patchedDependencies` applies by
  version range `pdf-parse-new@2.1.0`; a bump to 2.1.x still matches, a new
  minor needs the patch re-checked (upstream may fix the eager resolve).
