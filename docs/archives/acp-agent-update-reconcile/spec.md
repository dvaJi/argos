# ACP Agent Update Reconcile Spec

## Problem

Users get an "agent updates available" toast on every launch, but agents never actually update:

- Runner-based registry agents (`npx`/`uvx`) freeze `installState.version` at enable time.
  `updateAcpAgent()` returns the existing state for non-binary distributions without recording the
  registry's new version, so the mismatch — and therefore the toast — persists forever.
- Binary-distribution agents are never brought up to date automatically. The registry catalog
  refreshes at startup, but updating an installed binary requires clicking per-agent buttons in
  Settings.
- Failure states wedge indefinitely: a Windows `EACCES` during an Aug 18 update left `opencode`
  with `status: "error"` and a stale `installDir`; nothing heals it except an unrelated lazy
  ensure at the next session launch.

## Root Causes

1. Version bookkeeping treats runner agents like downloaded artifacts, but runners have no local
   copy to update — their recorded version must simply track the registry.
2. No component reconciles installed agents against the freshly refreshed registry at startup;
   detection (toast) and application (manual buttons) were wired to different actors.
3. Transient update failures overwrite the last-good install state, hiding working installs from
   the notification logic (`status !== "installed"`).

## Acceptance Criteria

- On daemon startup (after the registry settles), every **enabled** registry agent converges:
  - runner agents: recorded `installState.version` tracks the registry version (no download);
  - binary agents whose recorded version differs: the new version is installed into its own
    versioned directory without touching the old one; on failure the previous good state is kept.
- `updateAcpAgent()` on a runner agent persists the registry version instead of returning stale
  state.
- Disabled and manual agents are never touched by reconciliation.
- Reconciliation after a manual registry refresh behaves identically to startup.
- With versions converged, the launch-time "updates available" toast no longer fires.

## Non-Goals

- No changes to the notification composable, settings UI, session-launch resolution, or the
  desktop-side legacy store split (`<userData>/acp_agents.json` vs `config/acp_agents.json`) —
  the latter is tracked separately.
- No parallel/cron-style update scheduler beyond the existing registry TTL refresh.
