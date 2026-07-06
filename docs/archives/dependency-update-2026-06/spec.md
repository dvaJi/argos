# Dependency update 2026-06 — Specification

## Goal

Refresh Argos dependencies to their latest versions while keeping the app building, typechecking,
and passing tests. Approach is **staged**: land all semver-compatible updates (Category A) plus the
low-risk UI minors (Category B) in one verified pass, then bump each major/breaking dependency
(Category C) as its own focused, independently-verifiable change.

The headline breaking change is `@agentclientprotocol/sdk` 0.16.1 → 0.28.1. v0.27.0 rewrote the SDK
to an app-style API. Per the user's decision, we do the **full migration** to `acp.client(...)` /
`acp.agent(...)` handlers (not just the deprecated compat shim).

## Motivation

- `pnpm outdated` reports ~45 outdated packages across the root and `@argos/desktop`, including
  security/bugfix patches and 12 major bumps.
- `@agentclientprotocol/sdk` is 12 minor versions behind (0.16.1 → 0.28.1). The ACP layer is
  central to the agent runtime; staying current keeps protocol compatibility (schema v1.14.0) and
  removes dependence on deprecated compat wrappers that will be removed upstream.
- `minimumReleaseAge: 1440` already gates freshness, so "latest" here means stable-for-≥24h.

## Scope

### In Scope

**Phase 1 — Category A (semver-compatible patches/minors, ~30 pkgs):** electron 42.4.0→.1, all
`@ai-sdk/*` patches, `@aws-sdk/client-*`, `ai`, `@tanstack/*`, `@tiptap/*` 3.26→3.27, `axios`
1.17→1.18, `recharts` 3.8.0→.1, `@duckdb/node-api` 1.5.3-r.1→.4-r.1, `nanoid`, `@iconify-json/*`,
`@playwright/test` 1.60→1.61, `stream-monaco`, `better-sqlite3-multiple-ciphers` 12.10.0→.11.1
(patched dep — verify patch still applies), `@types/xlsx` (note: deprecated upstream).

**Phase 1 — Category B (UI minors, review state changes):** `@base-ui/react` 1.5→1.6, `radix-ui`
1.5→1.6, `lucide-react` 1.18→1.21.

**Phase 2 — Category C (majors, one PR each):**

| Package | Current → Latest | Migration notes |
| --- | --- | --- |
| `@agentclientprotocol/sdk` | 0.16.1 → 0.28.1 | **Full migration** to app API per `MIGRATION_0.26_0.27.md`. See plan. |
| `@xterm/xterm` | 5.5.0 → 6.0.0 | + `@xterm/addon-fit` 0.10 → 0.11. Terminal rendering. |
| `@e2b/code-interpreter` | 1.5.1 → 2.6.1 | Major; sandbox code-exec surface. |
| `diff` | 8 → 9 | Patch rendering. |
| `https-proxy-agent` | 7 → 9 | Skips 8. Network proxy path. |
| `level` | 8 → 10 | Skips 9. Native `classic-level` (rebuilt via postinstall). |
| `pdf-parse-new` | 1 → 2 | Attachment parsing. |
| `undici` | 7 → 8 | HTTP client. |
| `katex` | 0.16 → 0.17 | Math rendering. |
| `sharp` | 0.34 → 0.35 | Native image (prebuilt; `allowBuilds: sharp: false`). |
| `tokenx` | 0.4.1 → 1.3.0 | Catalog. Tokenization/counting. |

### Out of Scope

- `@types/node` 24 → 25: **deferred.** Runtime is Node 24 (`engines: ">=24.14.1 <25"`); types should
  track the runtime. Revisit when the runtime moves to Node 25.
- Runtime injector bumps (`runtime/node`, `uv`, `ripgrep`, `rtk`) — managed by
  `pnpm run installRuntime`, not npm deps.
- Any feature/UI/IPC-contract change. This is a like-for-like refresh plus the mechanical ACP
  rewiring.
- Catalog deps whose current `^` range already permits the latest version need no catalog edit;
  only the lockfile moves.

## Acceptance Criteria

### AC-1 (Phase 1: safe refresh)

- `pnpm install` succeeds; `pnpm-lock.yaml` updated; `postinstall` native rebuild
  (`scripts/rebuild-native.mjs`) succeeds.
- `pnpm run typecheck` (node + web, via `tsgo`) passes.
- `pnpm test` (vitest main + renderer) is no worse than the current baseline.
- `pnpm run lint` (agent-cleanup-guard, architecture-guard, oxlint) passes.
- `pnpm run build` produces the expected `apps/desktop/out/**` tree.
- `better-sqlite3-multiple-ciphers@12.11.1` still applies the existing patch
  (`patchedDependencies`) cleanly.

### AC-2 (Phase 2a: ACP SDK migration)

- `@agentclientprotocol/sdk` is `^0.28.1`; no references to deprecated
  `ClientSideConnection` / `AgentSideConnection` remain in `src/`.
- The single constructor site (`acpProcessManager.ts:760`) uses `acp.client({ name })...connect(stream)`.
- All outbound agent calls go through the `ClientConnection.agent.request(...)` /
  `methods.agent.*` namespace (initialize, session/new, session/load, session/prompt,
  session/cancel, session/mode).
- All inbound `Client` handlers (requestPermission, session/update, readTextFile, writeTextFile,
  createTerminal, terminalOutput, waitForTerminalExit, killTerminal, releaseTerminal) are registered
  via `onRequest`/`onNotification` with the `methods.client.*` namespace.
- `PROTOCOL_VERSION`, `RequestError`, and `schema.*` type imports remain valid (protocol types
  are unchanged upstream).
- ACP unit tests pass: `acpContentMapper.test.ts`, `acpProcessManagerCapabilities.test.ts`,
  `acpMcpPassthrough.test.ts`; the `vi.mock("@agentclientprotocol/sdk", ...)` mock is updated to the
  new surface.
- No ACP-related deprecation warnings at runtime.

### AC-3 (Phase 2b–2c: remaining majors)

- Each major bump lands as its own change with typecheck + affected tests green.
- Native majors (`level`, `sharp`) rebuild cleanly via postinstall.

### AC-4 (Closeout)

- `pnpm run format` and `pnpm run i18n` pass.
- Architecture baseline regenerated if dependency coupling metrics moved
  (`scripts/generate-architecture-baseline.mjs`).

## Constraints

- **Windows-first dev environment.** Native rebuilds must succeed on win32 x64 (and the supported
  matrix in `pnpm-workspace.yaml`).
- **ACP is runtime-critical.** The migration must preserve identical wire behavior; the protocol
  types are unchanged, so this is purely an SDK wiring refactor.
- **Patched dependency.** `better-sqlite3-multiple-ciphers` has a local patch; the patched version
  must keep resolving.
- **Catalog vs direct pins.** Some deps are `catalog:` (edit `pnpm-workspace.yaml`), others are
  pinned directly in `apps/desktop/package.json`. Each bump must edit the right file.
- **Like-for-like.** No opportunistic refactors beyond what a bump requires.

## Non-Goals

- No Node runtime major bump.
- No bundler/build-tool changes (Vite/Electron majors are already current).
- No new dependencies.

## Open Questions

All resolved before implementation:

- **Q**: Scope this pass? **A**: Staged — A+B first, then each C major one-by-one (per user).
- **Q**: ACP SDK approach? **A**: Bump + full migration to the new app API now (per user).
- **Q**: SDD docs? **A**: Yes, this folder (per user).
- **Q**: `@types/node` 24→25? **A**: Deferred — types must track the Node 24 runtime.
