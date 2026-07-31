# Extract UI — Tasks

Actionable checklist (status of the migration). See `plan.md` for full detail.

## Done
- [x] `@argos/shared` web-safe (lazy electron-log)
- [x] `packages/ui` created; renderer sources moved (git mv)
- [x] Desktop shell-only Vite (main + preload); renderer build removed
- [x] All window loaders → daemon URLs (`lib/daemonUi.ts`)
- [x] Daemon sidecar serves UI (`--web --web-root`)
- [x] `electron-builder.yml` web resources; daemon `resolveWebRoot` updated
- [x] Architecture/agent-cleanup guards + baseline generator repointed to `packages/ui`
- [x] Path-alias migration `#` prefix + `@argos/shared` real package names
- [x] AGENTS.md rewritten

## TODO — runtime/packaging verification (needs Electron; not runnable here)
- [ ] E2E launch: `pnpm --filter @argos/ui build && pnpm dev` → window renders daemon-served UI
- [ ] Native-only routes still work via hybrid bridge over `http://127.0.0.1` origin
- [ ] Splash startup ordering (inline fallback path)
- [ ] `electron-builder` packaging produces working app (web + daemon bundled)
- [x] Dev HMR: concurrent `@argos/ui dev` (5180) + explicit UI server URL
- [x] Prevent initial chat submission while the daemon bridge is connecting
- [x] Dispatch a new session's initial prompt through daemon provider execution

## TODO — cleanup
- [ ] `knip` + prune UI-only deps from `apps/desktop/package.json`
- [ ] Remove stray `apps/desktop/out/index.html` artifact
- [ ] Run `test/renderer` suite (aliases repointed, not yet run)

## Deferred (follow-up)
- [x] Migrate settings off raw Electron IPC → typed clients / daemon (see `docs/architecture/settings-typed-clients/`)
