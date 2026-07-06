# Vue-to-React Migration Parity Audit

Compared repos:

- Current migration target: `H:\personal-proy\argos3`
- Original reference: `H:\o-proy\argos`

## Summary

- High-level route and settings inventory is mostly present in `argos3`.
- Confirmed materially incomplete or missing parity items: 6.
- Additional areas still need runtime verification before calling the migration feature-complete.

## Confirmed Gaps

### 1. MCP settings are still largely placeholder/incomplete

- `argos3` ends the main MCP pane with a placeholder and a no-op Add flow:
  - `src/renderer/settings/components/McpSettings.tsx:85-123`
- Original Argos mounts the full MCP server management UI, add-server flow, advanced npm-registry settings, and onboarding overlay:
  - `H:\o-proy\argos\src\renderer\settings\components\McpSettings.vue:37-167`
  - `H:\o-proy\argos\src\renderer\settings\components\McpSettings.vue:175-319`

### 2. Argos Agents editor is materially reduced

- `argos3` exposes a basic list, enable/delete actions, and editable system prompt only:
  - `src/renderer/settings/components/ArgosAgentsSettings.tsx:83-216`
- Original Argos includes avatar modes/colors, description, multiple model selectors, default project path, permission mode, subagents, tool selection, compaction settings, and prompt template dialog:
  - `H:\o-proy\argos\src\renderer\settings\components\ArgosAgentsSettings.vue:107-337`
  - `H:\o-proy\argos\src\renderer\settings\components\ArgosAgentsSettings.vue:389-586`
  - `H:\o-proy\argos\src\renderer\settings\components\ArgosAgentsSettings.vue:675-1247`

### 3. Data settings lost major cloud-sync UX and validation parity

- `argos3` has a basic endpoint/bucket/region/access-key form with save/test/upload/pull buttons:
  - `src/renderer/settings/components/DataSettings.tsx:379-530`
- Original Argos had R2 vs custom provider mode, guided help, validation/warnings, safe-storage messaging, save-first gating, and separate save-only vs save-and-test flows:
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:168-484`
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:1321-1449`

### 4. Database encryption management UI appears missing

- `argos3` keeps encryption-related state but does not render an equivalent encryption-management section in the visible settings flow:
  - `src/renderer/settings/components/DataSettings.tsx:84-88`
  - `src/renderer/settings/components/DataSettings.tsx:535-757`
- Original Argos has a full database-encryption section with status, enable/change/disable actions, password dialog, and migration/safe-storage messaging:
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:503-673`
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:1138-1241`
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:1493-1575`

### 5. Provider ordering and reordering support is missing

- Original Argos uses draggable enabled/disabled provider lists:
  - `H:\o-proy\argos\src\renderer\settings\components\ModelProviderSettings.vue:65-73`
  - `H:\o-proy\argos\src\renderer\settings\components\ModelProviderSettings.vue:128-136`
- `argos3` renders static lists only. The drag affordance remains, but there is no draggable container or reorder handler:
  - `src/renderer/settings/components/ModelProviderSettings.tsx:188-239`
  - `src/renderer/settings/components/ModelProviderSettings.tsx:315-333`

### 6. Localization parity was materially incomplete across migrated UI

- This gap has since been intentionally closed by product-scope reduction: localization was removed and the renderer now targets fixed English/LTR behavior.
- Historical evidence for the removed gap:
  - `src/renderer/src/pages/WelcomePage.tsx:294`
  - `src/renderer/src/pages/WelcomePage.tsx:336-349`
  - `src/renderer/src/pages/WelcomePage.tsx:381`
  - `src/renderer/src/pages/WelcomePage.tsx:477-492`
  - `src/renderer/settings/components/ModelProviderSettings.tsx:286-295`
  - `src/renderer/settings/components/DataSettings.tsx:246-247`
  - `src/renderer/settings/components/DataSettings.tsx:383-385`
- Original Argos uses `t(...)` on the same surfaces:
  - `H:\o-proy\argos\src\renderer\src\pages\WelcomePage.vue:27-56`
  - `H:\o-proy\argos\src\renderer\src\pages\WelcomePage.vue:73-108`
  - `H:\o-proy\argos\src\renderer\src\pages\WelcomePage.vue:123-141`
  - `H:\o-proy\argos\src\renderer\src\pages\WelcomePage.vue:224-237`
  - `H:\o-proy\argos\src\renderer\settings\components\ModelProviderSettings.vue:33-45`
  - `H:\o-proy\argos\src\renderer\settings\components\DataSettings.vue:172-176`
- Recent activity text is also untranslated/raw in `argos3`:
  - `src/renderer/settings/components/SettingsOverview.tsx:293-295`
- Original Argos translates the same activity strings with params:
  - `H:\o-proy\argos\src\renderer\settings\components\SettingsOverview.vue:132-135`

## Notable Parity Wins

### 1. Settings route inventory and navigation structure are broadly preserved

- Same shared settings navigation model exists in both repos:
  - `src/shared/settingsNavigation.ts`
  - `H:\o-proy\argos\src\shared\settingsNavigation.ts`
- `argos3` settings router maps the same major screens as the original settings app:
  - `src/renderer/settings/main.tsx:43-62`
  - `H:\o-proy\argos\src\renderer\settings\main.ts:15-35`
- Sidebar grouping/navigation is preserved in the dedicated settings shell:
  - `src/renderer/settings/App.tsx:129-153`
  - `H:\o-proy\argos\src\renderer\settings\App.vue:31-55`

### 2. Main renderer route structure is preserved at a high level

- Original Argos route surface:
  - `H:\o-proy\argos\src\renderer\src\router\index.ts:5-28`
- `argos3` route surface:
  - `src/renderer/src/routes/index.tsx:3-6`
  - `src/renderer/src/routes/chat.tsx:4-5`
  - `src/renderer/src/routes/welcome.tsx:4-5`

### 3. Core chat tab page switching/bootstrap flow is preserved

- `argos3` still bootstraps startup state and switches among AgentWelcome, NewThread, and ChatPage based on the page router:
  - `src/renderer/src/views/ChatTabView.tsx:42-99`
  - `src/renderer/src/views/ChatTabView.tsx:113-129`
- Original Argos does the same:
  - `H:\o-proy\argos\src\renderer\src\views\ChatTabView.vue:68-125`
  - `H:\o-proy\argos\src\renderer\src\views\ChatTabView.vue:6-21`

### 4. Most major settings screens do have React counterparts

- Present in `argos3`: Common, Display, Environments, Provider, MCP, ACP, Remote, Notifications Hooks, Scheduled Tasks, Plugins, Skills, Prompt, Knowledge Base, Database, Shortcut, About, Overview.
- Evidence:
  - `src/renderer/settings/main.tsx:43-62`
  - `H:\o-proy\argos\src\renderer\settings\main.ts:15-35`

## Uncertain Items Requiring Runtime Verification

### 1. Chat and new-thread feature depth

- Large React counterparts exist:
  - `src/renderer/src/pages/ChatPage.tsx`
  - `src/renderer/src/pages/NewThreadPage.tsx`
- But full parity for composer behavior, advanced model controls, attachments/artifacts, and browser-side interactions still needs runtime comparison against:
  - `H:\o-proy\argos\src\renderer\src\pages\ChatPage.vue`
  - `H:\o-proy\argos\src\renderer\src\pages\NewThreadPage.vue`

### 2. Provider detail interaction paths beyond list reordering

- React versions appear to preserve connection/models/advanced tabs and detail screens:
  - `src/renderer/settings/components/ModelProviderSettingsDetail.tsx`
  - `src/renderer/settings/components/BedrockProviderSettingsDetail.tsx`
- Actual save/check/onboarding behavior still needs runtime verification against the Vue originals.

### 3. Remaining settings screens not line-by-line audited

- Skills, Knowledge Base, Scheduled Tasks, ACP, Remote, Notifications Hooks, Display, and Common all have migrated counterparts, but not every interaction path was verified in this audit.

## Migration Readout

- Structural migration status: high.
- User-facing feature parity status: not complete.
- Best current reading from code comparison: the migration preserved most screen inventory and route structure, but still has at least 6 confirmed materially incomplete parity areas concentrated in settings and localization.
