# Vue-to-React Migration — Tasks

## Phase 1 — Infrastructure [x]
- [x] 1.1 SDD artifacts
- [x] 1.2 Install React packages, remove Vue packages
- [x] 1.3 Update electron.vite.config.ts
- [x] 1.4 Update tsconfig files
- [x] 1.5 Update vitest configs
- [x] 1.6 Update package.json scripts
- [x] 1.7 Update env.d.ts files
- [x] 1.8 Run pnpm install

## Phase 2 — Shadcn [x]
- [x] 2.1 Init React shadcn
- [x] 2.2 Regenerate all 48 component groups
- [x] 2.3 Verify and diff custom modifications

## Phase 3 — Stores [x]
- [x] 3.1 Convert all 37 Pinia stores to TanStack Store
- [x] 3.2 Convert useIpcQuery/useIpcMutation to TanStack Query
- [x] 3.3 Convert startupWorkloadStore to React hook

## Phase 4 — Composables [x]
- [x] 4.1 Convert all top-level composables (useArtifacts, useArtifactCodeEditor, etc.)
- [x] 4.2 Convert message composables (useMessageCapture, useMessageScroll, useMessageWindow)
- [x] 4.3 Convert chat composables (useSpeechRecognition, useVoiceInput, useChatInputMentions, useChatStatusBarAcpConfig)
- [x] 4.4 Convert chat-input composables (useAgentMcpData, useChatMode, useContextLength, etc.)
- [x] 4.5 Convert sidepanel composables (useWorkspaceSync, useWorkspaceViewerModel)
- [x] 4.6 Convert markdown composable (useMarkdownLinkNavigation)
- [x] 4.7 Convert json-viewer components (JsonValue, JsonObject, JsonArray → TSX)
- [x] 4.8 Convert use-toast.ts to React sonner wrapper

## Phase 5 — Router [x]
- [x] 5.1 Main renderer TanStack Router (createHashHistory, lazy routes)
- [x] 5.2 Settings renderer TanStack Router (dynamic routes from settingsNavigation)
- [x] 5.3 Convert storeInitializer.ts (removed vue-router)
- [x] 5.4 Convert guidedOnboardingSettings.ts (removed vue-router type)

## Phase 6 — i18n Removal [x]
- [x] 6.1 Delete src/renderer/src/i18n/ directory (21 locale folders)
- [x] 6.2 Replace all t() calls with English strings (stores + composables done, .vue templates deferred to Phase 9)
- [x] 6.3 Remove createI18n/useI18n from all entry points

## Phase 7 — Entry Points [x]
- [x] 7.1 Main renderer main.tsx (createRoot + QueryClientProvider + RouterProvider)
- [x] 7.2 Splash renderer (Loading.tsx + main.tsx)
- [x] 7.3 Floating renderer (FloatingButton.tsx + FloatingSessionItem.tsx + main.tsx)
- [x] 7.4 Browser overlay renderer (BrowserActivityOverlay.tsx + main.tsx)
- [x] 7.5 Settings renderer main.tsx (TanStack Router + QueryClientProvider)
- [x] 7.6 Update all index.html script src references (.ts → .tsx)

## Phase 8 — Markdown [x]
- [x] 8.1 Update markdownWorkerLifecycle.ts (remove markstream-vue imports)
- [x] 8.2 Build React MarkdownRenderer (react-markdown + rehype/remark plugins)
- [x] 8.3 Convert MarkdownRenderer.vue → MarkdownRenderer.tsx
- [x] 8.4 Update ThinkContent.vue, MessageBlockToolCall.vue, CodeArtifact.vue, AboutUsSettings.vue

## Phase 9 — Components [x]
- [x] 9.1 App.vue → App.tsx (624 lines, most complex component)
- [x] 9.2 Pages and views (ChatTabView, WelcomePage, ChatPage, etc.)
- [x] 9.3 Main renderer components (AppBar, WindowSideBar, ChatInputBox, ChatStatusBar, etc.)
- [x] 9.4 Settings renderer components (App.vue, ~85 components)
- [x] 9.5 Floating components (already converted in Phase 7)

## Phase 10 — API Clients [x]
- [x] 10.1 Remove toRaw from presenterTransport.ts

## Phase 11 — Library Replacements [x] (mostly done inline)
- [x] 11.1 useChatInputMentions: VueRenderer → ReactRenderer
- [x] 11.2 useInputHistory: Editor from @tiptap/vue-3 → @tiptap/react
- [x] 11.3 use-toast.ts: vue-sonner → sonner
- [x] 11.4 json-viewer: defineComponent → React FC
- [x] 11.5 @iconify/vue → @iconify/react (converted in Phase 9)
- [x] 11.6 lucide-vue-next → lucide-react (converted in Phase 9)
- [x] 11.7 vuedraggable → static lists (converted in Phase 9)
- [x] 11.8 vue-virtual-scroller → ScrollArea (converted in Phase 9)
- [x] 11.9 @unovis/vue → @unovis/react (converted in Phase 9)

## Phase 12 — Tests [x]
- [x] 12.1 Update test infrastructure (setup.renderer.ts)
- [x] 12.2 Convert all renderer test files to @testing-library/react

## Phase 13 — Cleanup [x]
- [x] 13.1 Verify no stale Vue imports remain
- [x] 13.2 Run all verification commands
- [x] 13.3 Update documentation (AGENTS.md, etc.)
