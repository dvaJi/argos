# Tasks: workspace-selector-startup-loop

- [x] Reproduce the loop headlessly and capture the real error (CDP console capture).
- [x] Identify root cause: unstable `remoteUrls` identity + non-idempotent `registerHandlers`.
- [x] Make `registerHandlers` bail out when handlers are unchanged (`remoteSetup.ts`).
- [x] Memoize `remoteUrls` in `WorkspaceSelector`.
- [x] Remove temporary diagnostic stub from `packages/ui/index.html`.
- [x] Verify via CDP capture: app renders without `Maximum update depth exceeded`
      (hydration now completes: `interactive ready` → `critical loads complete` →
      `deferred hydration complete`).
- [x] `bun run format` + `bun run lint` + `@argos/ui` typecheck.
- [x] Fix the same bug class in the composer/chat components
      (`useChatInputMentions`, `ComposerEffortPicker`, `ChatStatusBar`,
      `ComposerModePicker`, `AcpComposerControls`, `ConnectionIndicator`,
      `UsageView`, `BrowserPanel`, `TreesFileTree`, `DiffsPanel`).
- [x] Remove module-scope clients from effect dep arrays (lint `exhaustive-effect-dependencies`).
- [x] Re-verify via CDP capture: no `Maximum update depth exceeded` in a 45s session.
- [x] Fix `settings/components/DashboardSettings.tsx` (mount effect re-running per render).
- [x] Sweep + hoist remaining in-body clients that reached effect deps
      (`AcpDiagnostics`, `AgentExtensionPolicyPanel`, `ScheduledTasksSettings`,
      `SettingsOverview`, `useSkillsData`, `ChatPage`).
