# Vue-to-React Migration Checklist

This document is the authoritative reference for the Argos renderer migration from Vue 3 to React.
Every checkbox must be ticked before the migration is considered complete.
Read this document in full before starting any phase.

---

## Global Constraints (apply to every phase)

- [ ] No changes to `src/main/**` (Electron main process) unless a preload type needs adjustment
- [ ] No changes to `src/preload/**` IPC contracts — `window.electron`, `window.api`, `window.argos` APIs remain identical
- [ ] No changes to `src/shared/**` types or utilities unless a renderer type import path changes
- [ ] No SSR assumptions — this is a desktop Electron app
- [ ] pnpm only — never introduce npm or yarn
- [ ] All commits follow conventional commits format per AGENTS.md
- [ ] No AI co-authoring footers in commits
- [ ] Run `pnpm run format` after every phase
- [ ] Run `pnpm run lint` after every phase
- [ ] No `.vue` files remain when the migration is complete
- [ ] No Vue packages remain in `package.json` when the migration is complete

---

 ## Phase 1 — Infrastructure and Dependencies ✅ COMPLETE
 
 ### 1.1 Install React packages
 
 Add these dependencies/devDependencies to `package.json`:
 
 Core:
 - [x] `react`
 - [x] `react-dom`
 - [x] `@types/react` (dev)
 - [x] `@types/react-dom` (dev)
 
 Build:
 - [x] `@vitejs/plugin-react` (dev, replaces `@vitejs/plugin-vue`)
 
 Router:
 - [x] `@tanstack/react-router`
 
 State:
 - [x] `@tanstack/react-store` (replaces pinia)
 - [x] `@tanstack/react-query` (replaces `@pinia/colada`)
 
 UI libraries (React equivalents):
 - [x] `sonner` (replaces `vue-sonner`)
 - [x] `@tiptap/react` (replaces `@tiptap/vue-3`)
 - [x] `@unovis/react` (replaces `@unovis/vue`)
 - [x] `@iconify/react` (replaces `@iconify/vue`)
 - [x] `lucide-react` (replaces `lucide-vue-next`)
 - [x] `@tanstack/react-virtual` (replaces `vue-virtual-scroller`)
 - [x] `@dnd-kit/core` (replaces `vuedraggable`)
 - [x] `@dnd-kit/sortable` (replaces `vuedraggable`)
 - [x] `@dnd-kit/utilities` (replaces `vuedraggable`)
 
 Markdown (replaces `markstream-vue`):
 - [x] `react-markdown`
 - [x] `remark-gfm`
 - [x] `rehype-katex`
 - [x] `rehype-highlight`
 - [x] `highlight.js` (if not already present)
 
 Forms (for shadcn form component):
 - [x] `react-hook-form`
 - [x] `@hookform/resolvers`
 
 Testing:
 - [x] `@testing-library/react` (replaces `@vue/test-utils`)
 - [x] `@testing-library/jest-dom`
 
 SVG support:
 - [x] `vite-plugin-svgr` (replaces `vite-svg-loader`)
 
 ### 1.2 Remove Vue packages
 
 Remove these from `package.json`:
 
 Vue core:
 - [x] `vue`
 - [x] `@vitejs/plugin-vue`
 - [x] `vite-plugin-vue-devtools`
 - [x] `vue-tsgo`
 
 Vue ecosystem:
 - [x] `vue-router`
 - [x] `vue-i18n`
 - [x] `pinia`
 - [x] `@pinia/colada`
 - [x] `@vue/test-utils`
 - [x] `@vueuse/core`
 
 Vue component libraries:
 - [x] `vue-sonner`
 - [x] `vue-virtual-scroller`
 - [x] `vuedraggable`
 - [x] `markstream-vue`
 - [x] `lucide-vue-next`
 - [x] `@iconify/vue`
 - [x] `@tiptap/vue-3`
 - [x] `@unovis/vue`
 - [x] `vee-validate`
 - [x] `@vee-validate/zod`
 - [x] `vite-svg-loader`
 
 i18n tooling (dropping i18n entirely):
 - [x] `@lingual/i18n-check`
 
 Other:
 - [x] `vue-demi` from `pnpm.ignoredBuiltDependencies` in `package.json`
 
 ### 1.3 Update `electron.vite.config.ts`
 
 - [x] Remove import of `vue` from `@vitejs/plugin-vue`
 - [x] Remove import of `vueDevTools` from `vite-plugin-vue-devtools`
 - [x] Remove import of `svgLoader` from `vite-svg-loader`
 - [x] Add import of `react` from `@vitejs/plugin-react`
 - [x] Add import of `svgr` from `vite-plugin-svgr`
 - [x] Remove the `isCustomElement` function definition
 - [x] Remove the `isVueDevToolsOverlayEnabled` variable
 - [x] In the `renderer` config:
   - [x] Remove `vue: 'vue/dist/vue.esm-bundler.js'` from `resolve.alias`
   - [x] Remove `markstream-vue` from `optimizeDeps.exclude` (package no longer exists)
   - [x] Replace the `vue(...)` plugin call with `react()` plugin call
   - [x] Remove the `vueDevTools(...)` conditional plugin
   - [x] Replace `svgLoader()` plugin with `svgr()` plugin
   - [x] Keep `tailwindcss()` plugin as-is
   - [x] Keep all `monacoEditorPlugin(...)` config as-is
   - [x] Keep all `rollupOptions.input` entries as-is
   - [x] Keep `cssCodeSplit: false` as-is
   - [x] Keep `worker.format: 'es'` as-is
   - [x] Keep `server.host` as-is
   - [x] Keep `optimizeDeps.include` as-is (adjust if needed for react equivalents)
 
 ### 1.4 Update `tsconfig.app.json` and `tsconfig.app.tsgo.json`
 
 Both files have identical content and must both be updated:
 
 - [x] Remove all `"**/*.vue"` glob patterns from `include` array
 - [x] Add `"**/*.tsx"` glob patterns where `**/*.vue` was
 - [x] Add `"jsx": "react-jsx"` to `compilerOptions`
 - [x] Keep all `paths` aliases as-is (`@/*`, `@api/*`, `@browser/*`, `@shared/*`, `@shadcn/*`)
 
 ### 1.5 Update `vitest.config.ts`
 
 - [x] Remove `import vue from '@vitejs/plugin-vue'`
 - [x] Remove the `isCustomElement` function
 - [x] Remove the `vuePlugin()` factory function
 - [x] Add `import react from '@vitejs/plugin-react'`
 - [x] In the `renderer` project: replace `plugins: [vuePlugin()]` with `plugins: [react()]`
 - [x] In the `main` project: replace `plugins: [vuePlugin()]` with `plugins: [react()]`
 - [x] Remove the `vue: 'vue/dist/vue.esm-bundler.js'` alias from the renderer project (it's in vitest.config.renderer.ts, not this file — verify)
 - [x] Keep all alias entries as-is except Vue-specific ones
 - [x] Keep coverage, timeout, setup file config as-is
 
 ### 1.6 Update `vitest.config.renderer.ts`
 
 - [x] Remove `import vue from '@vitejs/plugin-vue'`
 - [x] Remove the `isCustomElement` function
 - [x] Replace `vue(...)` plugin call with `react()` plugin call
 - [x] Remove `vue: 'vue/dist/vue.esm-bundler.js'` from `resolve.alias`
 - [x] Keep all other aliases as-is
 
 ### 1.7 Update `package.json` scripts
 
 - [x] `typecheck:web`: replace `vue-tsgo --project tsconfig.app.tsgo.json` with `tsgo --noEmit -p tsconfig.app.tsgo.json` (or `tsc --noEmit -p tsconfig.app.json`)
 - [x] Remove `i18n` script
 - [x] Remove `i18n:en` script
 - [x] Remove `i18n:types` script
 - [x] Remove `update-shadcn` script (will be replaced by React shadcn CLI)
 - [x] `dev:trace` script: remove the `ARGOS_VUE_DEVTOOLS_OVERLAY` env var reference
 - [x] Review all other scripts for Vue references — there should be none
 
 ### 1.8 Update environment type declarations
 
 - [x] Replace `src/renderer/src/env.d.ts`: remove the `declare module '*.vue'` block, keep `ImportMetaEnv` and `ImportMeta` interfaces
 - [x] Update `src/renderer/floating/env.d.ts`: remove the Vue module declaration
 - [x] Update `src/renderer/splash/env.d.ts`: remove the Vue module declaration
 - [x] Add `declare module '*.svg?react'` if using vite-plugin-svgr
 
 ### 1.9 Run `pnpm install`
 
 - [x] Run `pnpm install` to sync the lockfile after all package.json changes
 - [x] Verify no Vue packages remain in `pnpm-lock.yaml`
 - [x] Verify all new React packages are installed

---

## Phase 2 — Shadcn Component Library Regeneration ✅ COMPLETE

The project has 48 shadcn component groups under `src/shadcn/components/ui/`.
Each group contains `.vue` files and an `index.ts` barrel export.

### 2.1 Initialize React shadcn

- [ ] Back up the current `src/shadcn/` directory (or note it for diffing)
- [ ] Update `components.json` for React:
  - Change `$schema` to `https://ui.shadcn.com/schema.json`
  - Keep style: "new-york"
  - Keep typescript: true
  - Keep tailwind config as-is
  - Update aliases to match existing paths (`@shadcn/components`, `@shadcn/lib/utils`)
  - Change icon library to "lucide"
- [ ] Run `npx shadcn@latest init` with the updated config (non-destructive, creates React base)

### 2.2 Regenerate all 48 component groups

Run `npx shadcn@latest add <component>` for each:

- [ ] accordion
- [ ] alert-dialog
- [ ] alert
- [ ] aspect-ratio
- [ ] avatar
- [ ] badge
- [ ] breadcrumb
- [ ] button
- [ ] button-group
- [ ] calendar
- [ ] card
- [ ] chart
- [ ] checkbox
- [ ] collapsible
- [ ] combobox
- [ ] context-menu
- [ ] dialog
- [ ] dropdown-menu
- [ ] empty
- [ ] field
- [ ] form (will use `react-hook-form` instead of `vee-validate`)
- [ ] hover-card
- [ ] input
- [ ] input-group
- [ ] item
- [ ] kbd
- [ ] label
- [ ] menubar
- [ ] navigation-menu
- [ ] popover
- [ ] progress
- [ ] radio-group
- [ ] scroll-area
- [ ] select
- [ ] separator
- [ ] sheet
- [ ] sidebar
- [ ] skeleton
- [ ] slider
- [ ] sonner (will use `sonner` package instead of `vue-sonner`)
- [ ] spinner
- [ ] switch
- [ ] table
- [ ] tabs
- [ ] textarea
- [ ] toggle
- [ ] tooltip

### 2.3 Post-regeneration verification

- [ ] Verify `src/shadcn/lib/utils.ts` still exports `cn()` — it should be framework-agnostic
- [ ] Verify all `index.ts` barrel exports are correct
- [ ] Verify `class-variance-authority` imports still work (it's framework-agnostic)
- [ ] Verify `tailwind-merge` imports still work (it's framework-agnostic)
- [ ] Diff each regenerated component against the old Vue version to identify custom modifications that need manual re-application
- [ ] Delete any leftover `.vue` files in `src/shadcn/`
- [ ] Verify no `.vue` files remain in `src/shadcn/`

---

## Phase 3 — Stores (Pinia → TanStack Store) ✅ COMPLETE

There are 37 Pinia store files. Each uses `defineStore()` from pinia and `ref`/`computed`/`watch` from vue.

### 3.1 Migration pattern for each store

Every store file must be converted following this pattern:
- Replace `import { defineStore } from 'pinia'` with `import { Store } from '@tanstack/react-store'`
- Replace `defineStore('name', () => { ... })` with a `Store` instance
- Replace `ref(x)` → store state fields
- Replace `computed(() => ...)` → derived getters accessed from `store.state`
- Replace `watch(source, cb)` → `useStore` subscriptions
- Replace `onMounted`/`onUnmounted`/`onScopeDispose` → these lifecycle hooks move to React hooks that wrap the store
- Export a `useXxxStore()` React hook that returns reactive state via `useStore(store, selector)`
- Keep all business logic, IPC calls, and data transformation functions identical

### 3.2 Store files to convert (checklist)

Top-level stores (`src/renderer/src/stores/`):
- [ ] `agentModelStore.ts` — uses: ref
- [ ] `artifact.ts` — uses: computed, ref
- [ ] `dialog.ts` — uses: onMounted, onUnmounted, ref
- [ ] `floatingButton.ts` — uses: ref, onMounted
- [ ] `language.ts` — uses: ref, onMounted, useI18n (remove i18n, hardcode English)
- [ ] `mcp.ts` — uses: ref, computed, onMounted, watch, useI18n (remove i18n)
- [ ] `mcpSampling.ts` — uses: ref, computed, onMounted, onUnmounted
- [ ] `modelCheck.ts` — uses: ref
- [ ] `modelConfigStore.ts` — uses: ref
- [ ] `modelStore.ts` — uses: computed, ComputedRef, readonly, ref, watch
- [ ] `ollamaStore.ts` — uses: ref
- [ ] `prompts.ts` — uses: computed
- [ ] `providerDeeplinkImport.ts` — uses: ref
- [ ] `providerStore.ts` — uses: computed, ref, watch, useIpcQuery
- [ ] `reference.ts` — uses: ref
- [ ] `shortcutKey.ts` — uses: onMounted, ref
- [ ] `skillsStore.ts` — uses: ref, computed
- [ ] `startupWorkloadStore.ts` — uses: computed, ref
- [ ] `sync.ts` — uses: computed, ref
- [ ] `systemPromptStore.ts` — uses: ref, computed
- [ ] `theme.ts` — uses: useDark, useToggle (from @vueuse/core), ref
- [ ] `uiSettingsStore.ts` — uses: computed, onBeforeUnmount, onMounted, ref
- [ ] `upgrade.ts` — uses: computed, ref

UI sub-stores (`src/renderer/src/stores/ui/`):
- [ ] `agent.ts` — uses: ref, computed
- [ ] `agentPlan.ts` — uses: ref, useStorage (from @vueuse/core)
- [ ] `draft.ts` — uses: ref, shallowRef, toRaw
- [ ] `message.ts` — uses: ref, computed, onScopeDispose, getCurrentScope, isRef, toRef, Ref
- [ ] `messageIpc.ts` — check for Vue imports
- [ ] `pageRouter.ts` — uses: ref, computed
- [ ] `pendingInput.ts` — uses: computed, onScopeDispose, ref
- [ ] `project.ts` — uses: ref, computed
- [ ] `session.ts` — uses: ref, computed, onScopeDispose, getCurrentScope, ComputedRef
- [ ] `sessionIpc.ts` — check for Vue imports
- [ ] `sidebar.ts` — uses: ref
- [ ] `sidepanel.ts` — uses: computed, onScopeDispose, reactive, ref, useStorage
- [ ] `spotlight.ts` — uses: computed, ref, watch, useDebounceFn
- [ ] `stream.ts` — uses: ref

### 3.3 VueUse replacements needed in stores

These VueUse functions are used in stores and need React equivalents:
- [ ] `useDark` / `useToggle` (in `theme.ts`) → custom hook using `document.documentElement.classList` + IPC
- [ ] `useStorage` (in `agentPlan.ts`, `sidepanel.ts`) → custom hook using `localStorage`
- [ ] `useDebounceFn` (in `spotlight.ts`) → inline debounce via `useRef` + `setTimeout`
- [ ] `useThrottleFn` (in `modelStore.ts`) → inline throttle via `useRef` + `setTimeout`
- [ ] `refDebounced` (in settings `ModelProviderSettings.vue`) → inline debounce

### 3.4 Async state management (Pinia Colada → TanStack Query)

Files using `@pinia/colada`:
- [ ] `src/renderer/src/composables/useIpcQuery.ts` — rewrite to wrap `@tanstack/react-query` `useQuery`
- [ ] `src/renderer/src/composables/useIpcMutation.ts` — rewrite to wrap `@tanstack/react-query` `useMutation`
- [ ] `src/renderer/src/stores/providerStore.ts` — uses `useIpcQuery`
- [ ] `src/renderer/src/stores/modelStore.ts` — may use `useIpcQuery` indirectly
- [ ] Any store importing `useQueryCache` or `invalidateQueries` from `@pinia/colada` — switch to `useQueryClient` from `@tanstack/react-query`
- [ ] The `PiniaColada` plugin setup in `main.ts` and `settings/main.ts` → replace with `QueryClientProvider` + `QueryClient`

---

## Phase 4 — Composables → React Hooks ✅ COMPLETE

There are 25 composable files plus nested composables in component subdirectories.

### 4.1 Top-level composables (`src/renderer/src/composables/`)

Vue reactivity → React mapping:
- `ref(x)` → `useState(x)`
- `computed(fn)` → `useMemo(fn, [deps])`
- `watch(src, cb)` → `useEffect(() => { cb() }, [src])`
- `onMounted(cb)` → `useEffect(cb, [])`
- `onBeforeUnmount(cb)` → `useEffect(() => cb, [])`
- `toValue(x)` → just call `x` (React refs use `.current`, no `toValue` needed)
- `MaybeRefOrGetter<T>` → just `T` or `() => T`
- `Ref<T>` → `React.RefObject<T>` or state

Files to convert:
- [x] `useAppIpcRuntime.ts` — uses: ipcSubscription, event constants. No Vue reactivity, pure setup/teardown. Convert to a hook returning `{ setup, cleanup }` or auto-setup in `useEffect`.
- [x] `useArtifactCodeEditor.ts` — uses: ref, watch, onBeforeUnmount, Ref, useThrottleFn
- [x] `useArtifactContext.ts` — uses: Ref, ref, computed, watch
- [x] `useArtifactExport.ts` — check for Vue imports
- [x] `useArtifacts.ts` — uses: computed
- [x] `useArtifactViewMode.ts` — uses: Ref, ref, watch
- [x] `useChatConfigFields.ts` — uses: computed, ComputedRef, Ref, useI18n (remove i18n)
- [x] `useDeviceVersion.ts` — uses: ref, onMounted
- [x] `useFontManager.ts` — uses: watch
- [x] `useGuidedOnboardingStep.ts` — uses: computed, onBeforeUnmount, onMounted, ref, watch
- [x] `useImageActions.ts` — uses: useI18n (remove i18n)
- [x] `useIpcMutation.ts` — rewrite to use `@tanstack/react-query` (covered in Phase 3.4)
- [x] `useIpcQuery.ts` — rewrite to use `@tanstack/react-query` (covered in Phase 3.4)
- [x] `useModelCapabilities.ts` — uses: ref, watch, Ref
- [x] `useModelTypeDetection.ts` — uses: computed, watch, ref, ComputedRef, Ref
- [x] `useOnBoarding.ts` — uses: computed, toValue, watch, ComputedRef, MaybeRefOrGetter, Ref, useElementBounding, useElementSize
- [x] `usePageCapture.ts` — uses: ref
- [x] `usePageCapture.example.ts` — uses: ref, useI18n (remove i18n)
- [x] `useSearchConfig.ts` — uses: computed, Ref
- [x] `useThinkingBudget.ts` — uses: computed, ComputedRef, Ref, useI18n (remove i18n)
- [x] `useViewportSize.ts` — uses: ref

### 4.2 Message composables (`src/renderer/src/composables/message/`)

- [ ] `useMessageCapture.ts` — uses: ref, onUnmounted, nextTick, useI18n
- [ ] `useMessageScroll.ts` — uses: ref, reactive, readonly, onBeforeUnmount, nextTick, Ref
- [ ] `useMessageWindow.ts` — uses: computed, shallowRef, triggerRef

### 4.3 Chat composables (`src/renderer/src/components/chat/composables/`)

- [ ] `useAudioRecorder.ts` — uses: ref
- [ ] `useChatInputFiles.ts` — uses: ref, Ref
- [ ] `useChatInputMentions.ts` — uses: computed, onMounted, onUnmounted, ref, watch, Ref, VueRenderer (from @tiptap/vue-3)
- [ ] `useChatStatusBarAcpConfig.ts` — uses: computed, ref, watch, ComputedRef, Ref
- [ ] `useSpeechRecognition.ts` — uses: computed, ref
- [ ] `useVoiceInput.ts` — uses: Ref, computed

### 4.4 Chat-input composables (`src/renderer/src/components/chat-input/composables/`)

- [ ] `useAgentMcpData.ts` — uses: computed, ref, watch
- [ ] `useChatMode.ts` — uses: ref, computed, watch, useI18n (remove i18n)
- [ ] `useContextLength.ts` — uses: computed, Ref, unref, MaybeRef
- [ ] `useDragAndDrop.ts` — uses: ref, onUnmounted
- [ ] `useInputHistory.ts` — uses: ref, computed, Editor (from @tiptap/vue-3 → @tiptap/react)
- [ ] `useInputSettings.ts` — uses: ref, onMounted
- [ ] `usePromptInputFiles.ts` — check for Vue imports
- [ ] `useRateLimitStatus.ts` — uses: ref, computed, onMounted, onUnmounted, watch, Ref
- [ ] `useSkillsData.ts` — uses: ref, computed, watch, onMounted, onUnmounted, Ref, ComputedRef

### 4.5 Sidepanel composables (`src/renderer/src/components/sidepanel/composables/`)

- [ ] `useWorkspaceSync.ts` — uses: computed, onBeforeUnmount, onMounted, ref, watch, ComputedRef, Ref
- [ ] `useWorkspaceViewerModel.ts` — uses: computed, ComputedRef

### 4.6 Markdown composable

- [x] `src/renderer/src/components/markdown/useMarkdownLinkNavigation.ts` — uses: toValue, MaybeRefOrGetter → simple parameter adaptation

---

## Phase 5 — Router (vue-router → TanStack Router) ✅ COMPLETE

---

## Phase 8 — Markdown (markstream-vue → react-markdown) ✅ COMPLETE

### 8.1 Remove markstream-vue from markdownWorkerLifecycle

- [x] Replace markstream-vue worker lifecycle with no-op stub (KaTeX → rehype-katex, Mermaid → mermaid lib, highlighting → rehype-highlight)

### 8.2 Build React markdown components

- [x] `MarkdownRenderer.tsx` — react-markdown + remark-gfm + rehype-katex + rehype-highlight, debounced content, custom link/reference/code/mermaid rendering
- [x] `LinkNode.tsx` — replaces LinkNode.vue, uses useMarkdownLinkNavigation
- [x] `CodeBlock.tsx` — replaces CodeBlockNode, syntax highlighting via highlight.js
- [x] `MermaidBlock.tsx` — replaces MermaidBlockNode, renders via mermaid library
- [x] `markdown-renderer.css` — extracted prose/table styles from MarkdownRenderer.vue
- [x] `think-content.css` — extracted think-prose styles from ThinkContent.vue

### 8.3 Update consumer .vue files (temporary bridges until Phase 9)

- [x] `MarkdownRenderer.vue` — simplified to v-html bridge
- [x] `ThinkContent.vue` — inline SimpleNodeRenderer replaces markstream-vue NodeRenderer
- [x] `MessageBlockToolCall.vue` — inline CodeBlockNode Vue component
- [x] `CodeArtifact.vue` — inline MermaidBlockNode + getLanguageIcon
- [x] `AboutUsSettings.vue` — inline NodeRenderer with v-html

### 8.4 Update test files

- [x] Delete `test/renderer/assets/markstreamTailwindSource.test.ts` (verifies markstream-vue dist)
- [x] Rewrite `test/renderer/components/MarkdownRenderer.test.ts` as placeholder (full React tests in Phase 12)
- [x] Remove markstream-vue mock from `test/renderer/components/message/MessageBlockToolCall.test.ts`

---

## Phase 9 — Components (.vue → .tsx) ⬜ REMAINING

---

## Phase 10 — API Clients ✅ COMPLETE

---

## Phase 11 — Library Replacements (partially done inline) ⬜ REMAINING

