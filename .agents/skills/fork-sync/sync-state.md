# Sync state

Source: `ThinkInAIXYZ/deepchat` (remote `upstream`, default branch `dev`).
Fork point: `b67332c` (v1.0.6-beta.6). Source changes after the fork point are
listed below with integration status. One PR per feature.

Status: `pending` · `in-progress` · `PR #N` · `done` · `blocked` · `skip`

## Backend (port main-process / shared)

| Source SHA | Source PR | Feature | Status |
|---|---|---|---|
| `b5a26d85` | #1793 | Stop MCP servers on quit (plugin/mcp shutdown) | done (merged PR #2) |
| `3ea97717` | #1786 | Harden chat steer-abort queue | pending — **large**: route-API refactor (`sessions.steerPendingInput` replaces `resumePendingQueue`) + ~450-line `agentRuntimePresenter` rework; coordinate with React renderer. Defer. |
| `f171c4ff` | #1792 | Remove device-code login | **skip** — `openaiCodexAuth/` and all codex device-login refs are absent in the fork; nothing to remove. |
| `351af841` | #1788 | OpenAI Codex runtime provider | pending — **large** (1628 ins) and adds `openaiCodexAuth/` that #1792 later removes. Defer until the fork's OpenAI-Codex stance is decided. |
| `9cb9b581` | #1789 | API-key providers | done (merged PR #3) — added huggingface/upstage/minimax-global/moonshot-ai/alibaba-token-plan(±cn); skipped nvidia/fireworks/stepfun (already present) |
| `ce6796e8` | #1776 | CUA cross-platform runtimes | in-progress |
| `7154ad25` `06a32615` `c7d7e072` `ceefc95e` | — | Tape subsystem (manifest integrity, lineage, facts, view hash) | **blocked (large)** — 4 intertwined commits, ~460 lines across 11 files incl. the fork's most-diverged `agentRuntimePresenter/index.ts` + a missing `tapeViewManifest.ts`. Needs an SDD spec and a multi-PR split. |
| `72fe36bc` `ce4488aa` `71767ce1` `58978b00` `7082f339` `4344cedf` `bc3b4b08` `4099fdb0` `48b6b035` `7f6f2d92` `c9b205af` `b46c1911` `454417e2` `6e8301b8` | — | Memory subsystem (retrieval, extraction, injection, vector store, persona, lifecycle, settings) | blocked (large — needs an SDD spec; split into core/retrieval/lifecycle + React UI) |

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
