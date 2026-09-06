# Changelog

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
