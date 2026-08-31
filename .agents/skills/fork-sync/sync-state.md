# Sync state

Source: `ThinkInAIXYZ/deepchat` (remote `upstream`, default branch `dev`).
Fork point: `b67332c` (v1.0.6-beta.6). Source changes after the fork point are
listed below with integration status. One PR per feature.

Roadmap: see `roadmap.md` (2026-08-25) for the feature-level plan covering
source releases v1.0.7 → v1.1.1-beta.4, prioritized against the fork's current
state; this file tracks per-commit integration status.

Status: `pending` · `in-progress` · `PR #N` · `done` · `blocked` · `skip`

## Backend (port main-process / shared)

| Source SHA | Source PR | Feature | Status |
|---|---|---|---|
| `b5a26d85` | #1793 | Stop MCP servers on quit (plugin/mcp shutdown) | done (merged PR #2) |
| `3ea97717` | #1786 | Harden chat steer-abort queue | done (merged PR #5) — steer now aborts active turn (keeping partial output); stop auto-drains queue; pause/resume mechanism removed; single-owner abort settlement; `sessions.steerPendingInput` route replaces `resumePendingQueue`. |
| `f171c4ff` | #1792 | Remove device-code login | **skip** — `openaiCodexAuth/` and all codex device-login refs are absent in the fork; nothing to remove. |
| `351af841` | #1788 | OpenAI Codex runtime provider | pending — **large** (1628 ins) and adds `openaiCodexAuth/` that #1792 later removes. Defer until the fork's OpenAI-Codex stance is decided. |
| `9cb9b581` | #1789 | API-key providers | done (merged PR #3) — added huggingface/upstage/minimax-global/moonshot-ai/alibaba-token-plan(±cn); skipped nvidia/fireworks/stepfun (already present) |
| `ce6796e8` | #1776 | CUA cross-platform runtimes | done (merged PR #4) — platform/arch `engines.targets` targeting + `arch` threaded through settings-nav/plugin filtering. Deferred (separate): win32/linux CUA permission probes + Windows `launch_app` arg preflight (need the win32 runtime build). |
| — (tree port) | #2150-era `plugins/cua` | CUA Rust driver + embedded runtime | done (local sync) — replaced the vendored Swift driver with the prebuilt Rust `cua-driver-rs-v0.19.2` (checksum-pinned release assets) and the embedded-runtime host design: `cua-embedded-v1` adapter contract, sha256 integrity descriptors + macOS codesign verification, on-demand MCP servers with static tool catalogs, minimal env inheritance, CUA arg/result projections, Windows `launch_app` preflight (closes the PR #4 deferrals). SDD: `docs/features/cua-plugin-rust-driver/`. Host modules live in `packages/backend-core/src/cua/` + `packages/mcp-runtime` (registry shared by desktop + daemon). |
| `7154ad25` `06a32615` `c7d7e072` `ceefc95e` | — | Tape subsystem (manifest integrity, lineage, facts, view hash) | done (merged PRs #6, #7, #9, #10) — 4-PR SDD split: manifest types+builder, persistence+lineage, grounded tool-loop facts, React trace dialog UI. Re-introduced the manifest concept the fork had dropped. |
| `72fe36bc` `ce4488aa` `71767ce1` `58978b00` `7082f339` `4344cedf` `bc3b4b08` `4099fdb0` `48b6b035` `7f6f2d92` `c9b205af` `b46c1911` `454417e2` `6e8301b8` `df64127e` | — | Memory subsystem (retrieval, extraction, injection, vector store, persona, lifecycle, settings) + task-aware categories (#1802) | done (PR #13) — SDD at `docs/architecture/memory-subsystem/`. 4 phases + integration: MemoryPresenter wired into Presenter singleton, memoryPort injected into AgentRuntimePresenter, agent tool ports wired, persona evolution opt-in flag, mergeArgosConfig preserves memory fields. |
| `f5b09419` | #1851 | Honor category on manual memory add | done (PR #13) — ported `MemoryClient` (scoped to the 6 routes argos has: list/getStatus/search/add/delete/clear). `add()` uses the mutually-exclusive `kind`/`category` union and forwards `category` in the payload. Skipped Vue `MemoryManagerPanel` + i18n (React rebuild is a separate task). |

| `b5b480e` `3102e6d` | #1853 | Scope plugins, skills, and MCP by agent | done (local sync) â€” added agent-scoped allowlists for MCP servers, plugin-owned integrations, and skills; runtime tool resolution now filters MCP/tool/skill access by the active agent policy; settings UI persists the per-agent policy. |

## Backend + UI rebuild (port backend, rebuild UI in React)

| Source SHA | Source PR | Feature | Status |
|---|---|---|---|
| `8b656dd1` | #1787 | Directory / environments management | pending |
| `5968814b` | #1777 | Workspace single-item viewer | pending |

## Skip

| Source SHA | Source PR | Reason |
|---|---|---|
| `f22d13c1` | #1781 | Vue lib (markstream-vue) — fork is React |
| `0d24bed4` | #1783 | README refresh — fork has its own |
| `bc970669` | — | SDD process-doc prune |
| `1b1f74f0` `fe28b0b7` `46571714` | — | Releases beta.7/.8 — fork versions independently |

## Suggested order

1. Cheap backend wins: #1793 (done, PR #2) → #1786 → #1792.
2. Provider additions: #1788 + #1789.
3. Tape subsystem (foundation for memory).
4. Memory subsystem (needs a dedicated SDD spec first; split into multiple PRs).
5. Larger feature areas (#1787, #1777, #1776) — backend port + React UI rebuild.
