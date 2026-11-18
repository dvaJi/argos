# Changelog

## v0.8.0 (2026-11-18)

### Composer and model picker
- One ACP control surface: the duplicated agent list and the bogus Codex label are gone from the model picker; ACP model / reasoning / permission / collaboration chips now show in the composer footer before a session starts
- New ACP option picker with All / Favorites / lab filters, search, and per-agent favorites; selects are ordered model → reasoning → permission/mode → collaboration
- Picking a model keeps the picker open, and a bottom dock exposes reasoning-effort tabs plus the access (permission) toggle; provider pills scope the list and effort/permission state stays in sync with the footer chips
- Fixed model/effort chips never appearing for slow-starting npx-launched ACP agents (e.g. Command Code) before the first message, including after a session resume
- Manually selected projects are kept when switching ACP agents

### Models and providers
- Fixed model catalogs silently going stale: the provider DB size guard rejected every upstream refresh since July; catalog-backed providers (DeepSeek, ...) now read models live, and stored remote lists auto re-fetch when empty, older than 24h, or on an older schema (15s timeout with retry back-off)
- OpenRouter catalogs include all output modalities with vision/tools/reasoning mapping, model types (decisions, embedding, rerank, image, video, tts), free flag and creation date
- Model list: compact rows, Free filter and badge, Newest sort by default; pickers default to chat models, the image-generation picker offers image models, and connection checks prefer chat models
- Default providers synced with DeepChat, with icons for the new ones
- Command Code added as a built-in ACP agent, with its brand icon

### Dev
- `bun run e2e:demo` records a scripted product demo (agent → project → model → prompt) with a visible fake cursor; `bun run demo:render` trims and exports MP4/GIF
- e2e fixture no longer picks the splash window as the main window

## v0.7.0 (2026-11-15)

### Thread sidebar, archive, and projects
- Experimental thread sidebar rewritten with t3-style shelves: Pinned / Active / Working / Snoozed / Settled. Active is an inbox sorted by return time, Working by last send; collapsed shelves keep the open thread, and settling/snoozing/archiving the open thread advances to the next one
- Configurable auto-settle, snooze presets, early wake on approval or a new failure, coloured status text, and receding quiet rows
- Thread archive: new /archive page with search, restore, delete and delete-all; settle → archive → delete timers are configurable in Settings, with auto-delete gated by a history-loss warning
- Project settings: sidebar rows show the project icon, name and branch (worktree threads fold into their repository); Settings → Projects adds name, icon, pin, archive, and a default model/workspace for new threads

### Agent settings
- ACP agents: the update toast now offers Update / Update all directly, and a new updates banner lists installed vs latest versions with a registry filter and Repair actions for failed installs; npx/uvx agents get a working Update button
- Argos agents: the editor is split into tabs with an unsaved-changes bar (Ctrl+S), per-tab dirty dots, a discard guard, and a create dialog; built-in agents show their logo read-only, with a restore action when a stored custom avatar hides it
- Fixed refetch loops that clobbered env edits and made shared panels flicker, Clear not clearing, install/repair reporting success on error, and silently swallowed load failures

### Usage dashboard and limits
- Redesigned usage dashboard: header window/provider dropdowns with a Cost | Tokens | Limits switch, provider shares beside the daily chart, a totals row and a by-model table
- New Limits view: per-provider Codex session/weekly bars with an even-pace marker, reset chip, and hover details; Claude Code session/weekly/per-model limits read via the sign-in Claude Code already stored (the token is never refreshed and errors are shown in the view)

### Decision models
- Background memory judgments and routine tool-permission prompts are routed through OpenRouter decision models, so the main model no longer burns tokens deciding housekeeping questions

### Startup and splash
- The daemon binds its port immediately and serves the UI while the backend initializes, and the shell connects on the first attempt — no more reconnect backoff after launch
- The splash stays on screen until the main window is ready (capped at 15s) and was redesigned: app icon with halo, thin progress bar driven by real progress, stage-aware status line, dark/light themes, and reduced-motion support; critical startup failures now show a failed state
- Dev: the daemon runs from a cached single-file bundle rebuilt on change, cutting ~10s of antivirus rescans off cold starts on Windows

### Dependencies and toolchain
- Electron 44 → 45, pi-coding-agent 0.85 → 1.5.2, ACP SDK 2.5, refreshed provider catalog and ACP agent registry
- Type checking now covers every workspace package via `bun check` (13 packages were previously unchecked); formatting switched to `bun fmt`
- The landing page reports errors to ErrorDX

## v0.6.0 (2026-09-19)

### Managed toolchains
- The daemon now manages Node and uv installs: pinned, SHA-256-verified downloads with atomic activation and rollback, plus a new Toolchains settings page (per-tool source, install/repair/cancel/revert, custom path)
- ACP agents and MCP stdio servers resolve npx/npm/node/uvx through the managed toolchain service (bin dirs prepended to the spawn PATH), so headless machines no longer depend on what happens to be on PATH

### Agents (ACP)
- Terminal authentication for agents that require login: sign in from a dedicated dialog with an embedded terminal, retry after failures, and resume the conversation once authenticated (agents like MiniMax Code could previously never offer their login flow)
- Uninstalling or disabling a registry agent no longer dead-ends: sessions settle first (active turns cancelled, queued inputs handled) and conversations can be moved to another agent or deleted via the transfer dialog

### Reliability
- Standalone Argos Server binaries (and the daemon bundled in installers) no longer crash at startup on machines other than the build host — a `pdf-parse-new` resolution defect that shipped broken in v0.5.0 — and `argos-daemon --version` now reports the release version
- Per-session pending-input queue limit raised from 5 to 10, so more messages can be lined up during long agent turns
- Concurrent model discovery is coalesced per provider (keyed on provider settings), and Ollama tag/ps lookups share one request instead of fanning out per caller
- Failed requests release their fetch response bodies across daemon error paths instead of leaking connections

### Thread sidebar (experiment)
- Loads older sessions on scroll, clearable search with a no-results state, and a collapsed rail mode with an attention indicator
- Keyboard navigation and Alt/Cmd+1..9 shortcut badges now target the rows actually rendered; the open session is never hidden by snooze
- Performance work: per-field selectors, memoized rows, and the per-second store tick removed

### Housekeeping
- Components and stores migrated from `useStore` to `useSelector`
- Added `fetch:acp-registry` script to refresh the bundled ACP agent registry

## v0.5.0 (2026-09-07)

### Composer
- Added model favorites: star any provider model in the composer picker and reach it from a pinned Favorites section (per-device, survives reloads)

### Reliability
- Daemon configuration is now written atomically and corrupt files are preserved with a loud log line instead of silently resetting all settings (the "lost API keys" failure mode)

### Models and agents
- Refreshed the bundled provider catalog: 216 providers (+10) and 9,658 models (+179)
- Refreshed the bundled ACP registry: 39 agents (+antigravity-acp, devin, harn)

### Developer experience
- Root `bun run typecheck` now covers `@argos/ui` (UI type errors no longer surface only in CI)
- Windows desktop test suite fully green again (CUA runtime and plugin presenter fixes); release preflight validates version metadata before building

### Housekeeping
- Archived 65+ resolved SDD issue records; `docs/issues/` now tracks only open work

## v0.4.0 (2026-09-06)

### Integrated terminal
- Added VS Code-style terminal tabs in the right dock, powered by a daemon PTY runtime (Bun.Terminal, Bun 1.4): multi-terminal tabs, gap-free scrollback replay after reloads, resize, and exit/restart — works in browser/remote mode too
- ACP agent terminals migrated from node-pty to the host PTY, fixing agent terminals on Windows
- Terminal shells are now reliably terminated when closing a tab or shutting down the daemon (interactive shells ignore SIGTERM)

### Computer use (CUA)
- The CUA plugin now runs on an embedded Rust driver runtime with on-demand supervision and fail-closed startup errors
- Added a `/computer-use` slash command and bundled the CUA runtime into Windows/Linux builds
- Re-enabled unsigned macOS arm64 builds

### Workspace and sessions
- Git worktree sessions with a worktree/branch picker, plus a trees + diffs sidepanel
- Added a usage dashboard with local harness tracking
- Turn changed-files widget, grouped turn fold blocks, and a hide-thinking setting
- The daemon recovers interrupted turns on restart and reliably delivers steering input
- Resilient daemon reconnect, session status indicators, and settings redesigns

### Chat UX
- Per-action rows in the turn fold, markdown tables, and styled inline code
- New presence animation for loading states (pixel-grid primitive)
- Composer cleanup: duplicated model/mode controls removed, ACP session controls moved to the composer footer, slimmer status bar
- Fixed a memory panel infinite loading loop and a composer that went dead after session restore

### Platform and daemon
- Daemon-hosted knowledge base and daemon-owned state (pre-v1 legacy cleanup)
- Landing page rewritten agent-first with a vgpu shader background
- Renamed the Orchestrator agent to Orchi, with a logo
- Pi 0.84.3 (compaction failure handling, PowerShell support), ACP SDK 1.4.0, Electron 44
- Stability: workspace selector render loop, `mcp.callTool` contract alignment, markdown link guards, safe agent scratch workspace fallback
- Adopted React Compiler lint rules and resolved react-doctor findings across the UI

## v0.3.0 (2026-08-10)

### Agents and orchestration
- Added a built-in orchestrator agent with self-configurable provisioning
- Hardened AI-review with deny-by-default allowlists, stdio MCP gating, rollback isolation, and a redaction allowlist
- Exposed Pi built-in tools (read, bash, edit, write, grep, find, ls) in the daemon tool catalog with a redesigned per-tool settings UI

### Desktop UI
- Redesigned entry surfaces and the remote-machine setup flow
- Migrated settings off raw Electron IPC onto typed route clients and runtime wrappers
- Restored the `@argos/ui` build (monaco-editor 0.55 pin) and swept base-ui component migrations
- Added a setting to hide the "Continued" indicator and improved think-duration formatting
- Performance pass: memoized message rows/blocks, stabilized markdown and toolbar props, reduced rate-limit interval churn

### Daemon and reliability
- Fixed scheduled tasks firing in an infinite loop for daily/weekly triggers; serialized all task mutations
- Fixed the MCP scope panel reading from the wrong store (servers added via MCP settings were invisible)
- Fixed ACP session persistence, block ordering, config UX, and icon consistency

### Security
- Strip the pairing token from the URL before any network I/O
- Return a typed failure result on non-2xx pairing-token responses
- Log corrupt credentials files instead of silent data loss

### Events
- Added six typed ArgosEvent contracts (notifications, rate-limit) as the foundation for daemon event sourcing

### Other
- Pruned ~250 dead files and orphaned dependencies (knip reports zero unused)
- Updated all monorepo dependencies to latest, including the tokenx 2.x API migration
- Audited and archived outdated documentation

## v0.2.0 (2026-07-25)

### Headless daemon and web access
- Split the desktop app into a headless Bun daemon and a shell-only Electron app; the daemon now serves the UI over HTTP
- Added a web build target and browser bootstrap entry so Argos can run in a browser or on a VPS
- Added pairing-based browser access with session auth and a pairing URL generator in settings

### Memory and knowledge
- Ported the memory subsystem with full-text search and HTTP embeddings
- Added DuckDB vector similarity search for semantic memory recall

### Cloud sync
- Added S3-compatible cloud sync with config persistence and backup operations

### ACP and MCP
- Hardened ACP v1 reliability, including SQLite session persistence
- Enabled auto-approved MCP sampling via an HTTP provider

### Agent and sessions
- Adopted the new pi agent orchestration
- Added session summary titles for easier session management
- Added a daemon connection status banner in the UI

### Other
- Migrated workspace tooling to Bun and Turbo
- Aligned contributor docs and CI with the master integration branch

## v0.1.0 (2026-07-01)

- Initial open-source release of Argos under the new identity and repository
