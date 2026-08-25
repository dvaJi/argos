# Desktop Config Daemon Ownership Tasks

- [x] Add contracts + daemon handlers for providers.replaceAll, providers.setModels,
      models.statusSnapshot, mcp.configSnapshot/applyConfigPatch.
- [x] Implement DaemonMirrorStore + family factories on desktop.
- [x] Rewire helpers; add ModelStatusHelper write hook.
- [x] Route prompt/sensitive keys through mirrors inside getSetting/setSetting.
- [x] Delete configDbStores machinery + stale SyncPresenter test.

## Follow-ups (post v1)

- [ ] Propagate model-config deletions to the daemon (currently hydrate-only).
- [ ] Preserve `MODEL_META.samplingParams` through provider-model round-trips
      (dropped by the summary schema today).
- [ ] Replace the staleness-window refresh with a daemon event subscription from
      main-process for instant renderer-mutation visibility.
