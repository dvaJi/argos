# ACP Session Lifecycle Methods — Tasks

- [x] 1. Capability snapshot: `sessionDelete` / `sessionArchive` / `sessionStatus` supports flags.
- [x] 2. Runtime execution: `pushAcpSessionTitle`, `archiveAcpSession` (capability-gated), `getAcpSessionStatus` (capability-gated), `session/delete` best-effort in `purgeAcpSessionData` (capability-gated), `session/options` pre-fetch feeding `configOptions` into `session/fork`.
- [x] 3. Port surface: `hotPathPorts.ts` ProviderExecutionPort declarations, dispatcher port type + case hooks (rename → title push, setArchived → archive/unarchive), daemon index allowlist + wiring.
- [x] 4. Tests: capability snapshot `supports` flags (two fixtures updated).
- [x] 5. Validate: typecheck 17/17 packages, lint (route catalog), format, full desktop+daemon suites green.

**Method surface after this change: 16/16 client-initiated session methods wired** (`new`, `load`, `list`, `resume`, `fork`, `close`, `prompt`, `cancel`, `setMode`, `setConfigOption`, `setTitle`, `delete`, `archive`, `unarchive`, `status`, `options`). `status` and `options` are wired without dedicated UI consumers (options is used internally by fork).

