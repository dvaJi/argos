# Issue: WorkspaceSelector infinite render loop on startup

## Summary

On app startup, the renderer enters an infinite render/crash loop: `WorkspaceSelector`
throws `Maximum update depth exceeded` on every mount, TanStack Router's `CatchBoundary`
catches it, remounts the tree, and the cycle repeats forever. The main process spams
`[Window] Map(...)` logs because window visibility events fire during the loop.

## Reproduction

- Start `@argos/ui` dev server and open the app (Electron or headless Chrome).
- `WorkspaceSelector` mounts; React throws:
  `Error: Maximum update depth exceeded ... at Store.setState ... The above error occurred
  in the <WorkspaceSelector> component.`
- Router catches at the route match (`Warning: Error in route match`), remounts, loop repeats.

Confirmed via headless Chrome + CDP console capture against the dev server.

## Root cause

Feedback loop between `WorkspaceSelector` and `useRemoteSetupStore`:

1. `WorkspaceSelector` builds `remoteUrls` with `workspaces.flatMap(...)` — a new array
   identity on every render — and passes it to a `useEffect` keyed on `[remoteUrls]`.
2. The effect calls `registerHandlers(...)`, which always calls
   `remoteSetupStore.setState((prev) => ({ ...prev, handlers }))`.
3. TanStack Store notifies subscribers on every `setState` with a new object; every
   `useRemoteSetupStore()` consumer (`WorkspaceSelector`, `AddRemoteMachineDialog`)
   re-renders.
4. The re-render produces a fresh `remoteUrls` array → effect re-runs → `setState` again
   → React hits the nested-update limit and throws.

The loop is deterministic on every mount of `WorkspaceSelector`.

## Fix direction

- `registerHandlers` must be idempotent: bail out (no `setState`) when the handlers and
  `remoteUrls` are equal to the currently stored ones.
- Memoize `remoteUrls` in `WorkspaceSelector` so the effect only runs when the workspace
  list actually changes.

## Additional instances of the same bug class

After the initial fix, React surfaced the same "Maximum update depth exceeded" pattern in
the chat composer area. All instances share one of two root patterns:

1. **Render-created clients used as effect dependencies** — `create*Client()` called in the
   component body returns a new object every render; any effect depending on it re-runs on
   every commit, and its `setState` calls re-render the component forever.
2. **Fresh callback/array identities in effect deps** — e.g. `refreshAcpCommands` (recreated
   per render, calling `setAcpCommands([])` with a fresh `[]`).

Fixed by hoisting clients to module scope (the pattern already documented in
`useChatInputMentions.ts`) and removing module-scope values from dep arrays, plus
`useCallback` with primitive deps for the mentions callback. Files fixed:

- `components/chat/composables/useChatInputMentions.ts` (`useCallback` + primitive deps)
- `components/chat/ComposerEffortPicker.tsx` (`modelClient`, `sessionClient`)
- `components/chat/ChatStatusBar.tsx` (`configClient`, `modelClient`, `onboardingClient`,
  `providerClient`, `sessionClient` — the last is injected into the ACP config hook)
- `components/chat/ComposerModePicker.tsx` (`sessionClient`)
- `components/chat/AcpComposerControls.tsx` (`sessionClient`, `providerClient`)
- `components/ConnectionIndicator.tsx` (`client`)
- `views/UsageView.tsx` (`usageClient`)
- `components/sidepanel/BrowserPanel.tsx` (`browserClient`)
- `components/sidepanel/TreesFileTree.tsx` (`workspaceClient`)
- `components/sidepanel/DiffsPanel.tsx` (`workspaceClient`)

Second wave (reported after the first fix landed):

- `components/chat-input/McpIndicator.tsx` — `refreshAgentTools` callback was recreated per
  render and used as an effect dependency; `loadAgentTools` sets fresh `[]` state on every
  run. Fixed with `useCallback` + primitive deps.
- `components/chat-input/composables/useSkillsData.ts` — `skillClient` created in hook body.
  Hoisted to module scope.
- `pages/ChatPage.tsx` — `chatClient`/`sessionClient` created in component body and passed
  into `usePlanSnapshotSubscription`. Hoisted to module scope.

Third wave (reported after the second fix landed):

- `settings/components/DashboardSettings.tsx` — the mount effect depended on
  `clearRefreshTimer`, a fresh identity per render, so the "run once on mount" effect
  re-ran on every render; each run reloaded the dashboard and `setDashboard` with a fresh
  object, feeding the loop. Fixed with `useCallback` for `clearRefreshTimer`,
  `scheduleDashboardRefresh`, and `loadDashboard`; `usageClient` hoisted to module scope.
- Full sweep of remaining in-body `create*Client()` calls that reached effect dep arrays:
  `settings/components/AcpDiagnostics.tsx` (`providerClient`),
  `settings/components/AgentExtensionPolicyPanel.tsx` (`mcpClient`),
  `settings/components/ScheduledTasksSettings.tsx` (`client`, `configClient`),
  `settings/components/SettingsOverview.tsx` (`settingsClient`). Hoisted to module scope;
  removed from dep arrays.

Verified clean: 45s CDP capture of the main app shows zero
"Maximum update depth exceeded" and a full hydration lifecycle. The settings renderer could
not be captured headlessly (separate entry, cold transform exceeded the capture window);
the fix there is identical in structure to the runtime-verified ones.

## Impact

- Startup was unusable (permanent crash loop) whenever the sidebar mounted `WorkspaceSelector`.
- The composer-area instances spammed console errors (dozens of
  "Maximum update depth exceeded" per session) and re-fired real bridge requests on every
  render of the affected components.
- No data loss; localStorage is untouched.
