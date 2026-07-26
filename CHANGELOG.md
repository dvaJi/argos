# Changelog

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
