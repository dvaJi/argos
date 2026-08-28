# Spec: Adopt pi 0.84.2/0.84.3 capabilities

## Summary

Adopt the useful pieces of pi-coding-agent 0.84.1 → 0.84.3 (shipped in the deps PR). Three
adoptions; one skipped.

## A. Surface compaction failures in the UI (the top pick)

Today pi-worker `compaction` events (start/end) are **dropped** by `pi-provider-execution`, so
auto-compaction (threshold/overflow, mid-turn) is invisible and its failures silent. pi's
`compaction_end` already carries `errorMessage`/`aborted`/`willRetry` — the dedicated
`session_compact_failed` *extension* event adds only `fromExtension` (always false for Argos —
no before_compact handlers), so surfacing via the already-bridged `compaction_end` is lossless
without new protocol channels.

### Design

- Protocol: compaction event becomes `{ phase: "start" | "end" | "failed"; reason; error?;
  aborted?; willRetry? }`. Worker emits `phase: "failed"` when `errorMessage` is present or the
  compaction was aborted.
- Daemon: on `failed` with `!aborted && !willRetry` → `markError(sessionId)` (session status
  "error" + `sessions.status.changed`), so the failure is visible in the UI's session state.
  Aborted/retry cases log only (the turn continues).
- Manual `/compact` failures already propagate (worker `error` event rejects the compact waiter →
  UI toast) — unchanged.

## B. Windows PowerShell tool (opt-in)

pi 0.84.3 adds an optional native PowerShell tool (name `"powershell"`, `createPowerShellTool`),
not part of the default tool set (read/bash/edit/write). Adoption:

- `PiWorkerInit.enablePowershellTool?: boolean`; the worker passes
  `tools: ["read", "bash", "edit", "write", "powershell"]` to `createAgentSession` only when the
  flag is set AND `process.platform === "win32"`; otherwise `tools` stays undefined (current
  behavior; `excludeTools` denylist keeps applying).
- Source of truth: new config entry `pi_enable_powershell_tool` (boolean, default off) following
  the `thread_sidebar_enabled` plumbing exactly (entry keys/values/change schema, desktop +
  backend-core read support, `config.entries.changed` live sync).
- Toggle UI: Settings → Argos Agents ("Windows PowerShell tool (Windows only)" switch, wired to
  `configClient.getSetting/setSetting`).
- Worker signature includes the flag so toggling spawns a fresh worker on the next turn.

## C. Sampling parameters (incl. vLLM `thinking_token_budget`)

**Already implemented** in the composer/settings WIP: `ModelConfig.samplingParams` +
"Sampling Parameters (JSON)" editor in `ModelConfigDialog` with JSON validation, flowing through
`getModelConfig(...).samplingParams ?? model.samplingParams` into the pi provider model. This
change only adds a hint line documenting the vLLM `thinking_token_budget` usage.

## D. `expandPromptTemplates` — skipped

Argos has no programmatic `pi.sendUserMessage()` usage (verified); nothing to adopt.

## Acceptance criteria

- [ ] Compaction failure (auto, no retry) marks the session `error` + publishes status change;
      aborted/retrying failures log without killing the turn.
- [ ] `powershell` tool appears in pi sessions only when the config flag is on, on Windows;
      denylist (`disabledTools`) still applies after the allowlist.
- [ ] Flag toggle live-syncs (config.entries.changed) and rebuilds workers via the signature.
- [ ] SamplingParams hint text in the model dialog.
- [ ] Typecheck (desktop/daemon/ui), daemon `bun test`, lint.

## Non-goals

- Bridging the `session_compact_failed` extension event itself (superseded by `compaction_end`
  for Argos' data needs).
- Compaction progress indicator during `phase: "start"`.
- `expandPromptTemplates` adoption.
