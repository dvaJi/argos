# Tasks

- [x] Baseline scan pinned at react-doctor 0.9.12, JSON saved (score 0, 242 errors / 1098 warnings)
- [x] Baseline `bun run typecheck` + `bun run lint` pass recorded
- [x] Fix `effect-needs-cleanup` (8) — listener-specific cleanup, effect-driven resize tracking, timer ownership
- [x] Fix `no-impure-state-updater` (6) — pure map/filter updaters in Dify/FastGpt/Ragflow settings
- [x] Fix `no-ref-current-in-render` (10) — effect-based latest-value ref sync
- [x] Fix `use-memo` (10) — extract called expressions out of dependency arrays
- [x] Fix `refs` in src/pages/NewThreadPage.tsx (26) — guide targets moved from refs to state
- [x] Fix `immutability`/`todo` TDZ ordering in NewThreadPage.tsx
- [x] Fix ChatPage.tsx (11) — module-level message cache, callback reordering (no behavior change)
- [x] Fix TranslatePopup (3) — effect-driven drag listeners (also fixes mid-drag unmount leak)
- [x] Fix TraceDialog (3), ModelCheckDialog (2), TreesFileTree (1), MessageBlockThink (1), MessageBlockAction (1), McpPromptPanel (1), FloatingButton (1)
- [x] Bucket B agent: MessageListRow, ChatTopBar, McpIndicator (3 fixed; others pre-cleared)
- [x] Bucket C agent: settings.tsx, _main.tsx, useWorkspaceSync (+6 bonus todo clears)
- [ ] Bucket A agent: settings components (in progress — App.tsx, ModelProviderSettings, McpSettings, ProviderRateLimitConfig, ShortcutSettings, VoiceAI, ProviderConfigImportDialog, AddCustomProviderDialog)
- [x] Triage `todo` (111): ~96 try/finally + try-without-catch HIR lowering limits + 7 throw-in-try + 8 misc — documented deferrals; ~10 cleared as side effects of other fixes
- [ ] Final rescan: full scope, improved score, no new cross-category diagnostics
- [ ] `bun run format` + `bun run lint` + `bun run typecheck` green
