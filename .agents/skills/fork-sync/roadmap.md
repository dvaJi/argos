# Integration roadmap

Derived 2026-08-25 from the source `CHANGELOG.md` (dev branch, up to v1.1.1-beta.4)
cross-checked against the fork's actual state. **Revised same day: Pi-first lens**
after confirming the harness reality (below).

Status legend: `now` (quick win) · `next` (subsystem PR) · `later` (strategic) ·
`watch` (low fit today) · `skip`. Effort: S/M/L/XL.

## Harness reality — Pi, not a custom loop

The fork embeds `@earendil-works/pi-coding-agent` (pinned 0.84.1) as its agent
runtime; the source's custom harness (`src/main/agent/deepchat/*` —
`DeepChatLoopRunner`, `DeepChatContextCoordinator`, `CompactionService`,
`ToolSurface`, journal/View machinery) has **no counterpart here**. Ownership:

| Layer | Owner | Fork location |
|---|---|---|
| Agent loop, turns, tool invocation, permissions | **Pi** (worker process) | `apps/daemon/src/host/piWorker.ts` (stdio worker hosting Pi `AgentSession` + extensions) |
| LLM HTTP calls, provider catalog, sampling, cache markers | **Argos** | `apps/daemon/src/host/pi-provider-execution.ts` + `backend-core` provider layer (Pi requests completions from the daemon; we execute) |
| Context assembly / compaction policy | **Pi** (its auto-compaction); we inject content via extension seams | Pi `InlineExtension` + `packages/pi-orchestrator-extension` |
| Subagents / orchestration | **Pi extensions** | `packages/pi-orchestrator-extension` (Orchi) |
| MCP runtime, memory store/retrieval, scheduled tasks, knowledge, toolchains, sessions DB, UI, control plane | **Argos** | `packages/mcp-runtime`, backend-core, `packages/ui`, daemon |

**Decision rule for source features:** harness-internal features are never
ported as code. For each, pick one:
(a) **adopt from Pi** — run the `pi-update` skill review; Pi upstream may already
solve it (compaction, modes, subagents);
(b) **contribute upstream to Pi** when the fix belongs in the loop;
(c) **reimplement at our seams** — worker provider bridge, Pi extensions,
MCP runtime, or daemon routes — when the value is Argos-side.

Fit baseline (what the fork already has): memory subsystem v1, tape subsystem,
agent-scoped allowlists, prompt-cache strategy, Orchi orchestrator (Pi ext),
scheduled tasks, remote control, usage dashboard (worker already emits per-turn
usage incl. cacheRead/cacheWrite), knowledge base, git worktree sessions,
image/video/TTS model types.

## Horizon 1 — now (quick wins & fixes)

| # | Item | Source | Owner / landing spot | Effort | Notes |
|---|------|--------|----------------------|--------|-------|
| 1 | Honor model-configured request timeouts instead of a default header timeout; inherit global fetch timeouts on proxy fetches | v1.1.1-beta.2 | **Argos** — `pi-provider-execution` + backend-core provider layer (all Pi-session completions flow through it) | S | Pure correctness; no UI |
| 2 | Tolerate invalid MCP tool output schemas instead of rejecting the tool; dedupe equivalent JSON schemas for large catalogs | v1.1.0-beta.11/12 | **Argos** — `packages/mcp-runtime` tool cache | S–M | Cheap robustness for real-world servers |
| 3 | New provider presets (TokenLab, OpenCode Go, AMD GPU Cloud, DaoXE, GreenPT, Modelsell, OrcaRouter, Routerra, Straico, Grok OAuth) | v1.0.8–v1.1.0 | **Argos** — `backend-core/src/config/providers.ts` (same pattern as merged PR #3) | S each | Presets reach Pi via the worker-provider model registration, so no Pi change needed |
| 4 | Retry UX: keep the user message mounted on retry; fix retry-budget double counting and duplicate pinned prompts | v1.1.1-beta.4 | **Argos renderer** — but verify Pi's turn-retry semantics first; the fork may not share these bugs | S | Audit, then fix only what's real |
| 5 | Small correctness batch: no silent empty-file reads; guard-stop terminal surfacing; Ollama context-budget handling; MiniMax-M3 temperature omission | v1.1.1-beta.1/2 | Mixed: empty-file reads are a **Pi tool** behavior (check Pi; contribute upstream if needed); temperature/capability omissions are **Argos** provider mapping (`pi-model-sampling-params` already gives the seam) | S each | Verify per item |
| 6 | Prompt-cache stability: cache markers reach OpenAI/Anthropic/Bedrock/OpenRouter/Zenmux; volatile injections (memory/knowledge) must not churn the cached prefix | v1.1.0-beta.8 | **Argos** — two seams: cache markers in our provider execution (`promptCacheStrategy.ts`), and stable injection ordering where our extensions append memory/knowledge into Pi's context | M | **High leverage.** Pi owns the message list, but we own the request shaping — keep volatile content out of the cached prefix |
| 7 | Transient provider failure retry: bounded, abortable backoff; never replay a request once output was committed | v1.1.0-beta.8 | **Argos** provider layer for retry/backoff; the "committed output" boundary needs Pi turn-state (worker protocol already tracks streaming settlement) | M | Pairs with #1 |

## Horizon 2 — next (subsystem PRs, SDD first)

| # | Item | Source | Owner / landing spot | Effort | Notes |
|---|------|--------|----------------------|--------|-------|
| 8 | **Memory v2** — time-aware claims (`temporal_kind`, `valid_from/until`, domain clock, recall eligibility), Directives (user-written = immediate, model-suggested = draft until approved, `suppress_topic`), tombstones (SHA-256, survives clear, blocks re-extraction), derivation lineage, incremental maintenance via dirty queue instead of full rescans | v1.0.9 + v1.1.0 | **Argos** — store/retrieval/directives fully ours (memoryPresenter → backend-core); injection rides the existing Pi extension seam; Directives map naturally to always-on extension instructions | L | Natural continuation of PR #13. Split: (a) schema+temporal, (b) directives, (c) tombstones+lineage, (d) incremental maintenance. Fixes the "corrections reappear" bug class |
| 9 | ~~Context compaction v2~~ → **occupancy UX on top of Pi compaction** | v1.1.1-beta.1 | **Pi owns compaction.** First run the `pi-update` review: check what Pi 0.84+ auto-compaction already gives us. Argos value-add: context-occupancy indicator in the UI (worker already emits per-turn usage), plus tape-provenance on compacted turns if Pi exposes a hook | S–M | Source's recovery ladder/boundary anchors are harness internals — not portable. Only build here if Pi genuinely lacks a piece |
| 10 | **Tool catalog bounding** — cap tools registered into the Pi worker; inject a `tool_search` Pi tool (via `defineTool`) for on-demand discovery of the frozen catalog | v1.1.1-beta.1 (concept) | **Argos** — bound at the MCP runtime / tool-mapper layer *before* tools are registered into `piWorker.ts`; agent-scoped allowlists are the policy layer | M | Solves "100+ MCP tools blow the context window" without touching Pi's loop. The source's ToolSurface/journal machinery is not portable |
| 11 | **MCP OAuth** — full authorization-code/PKCE flow for MCP servers (we only have static Bearer `SimpleOAuthProvider`) | v1.0.8 | **Argos** — `packages/mcp-runtime` + settings UI | M | Required by an increasing number of remote MCP servers |
| 12 | **Managed toolchains** — single-source-of-truth resolution for node/uv (bundled/managed/system/custom), demand signals from MCP/ACP/skills, SHA256-verified resumable downloads, install/repair/revert | v1.1.1-beta.3 | **Argos** — daemon-owned service; generalizes our `runtime/` + `installRuntime` (bun/ripgrep/uv/rtk) | M | Directly addresses open issues: `runtime-install-bun-x-failure`, `skills-path-cross-platform-repair`, `mcp-server-start-regression` |
| 13 | **ACP terminal authentication** — terminal-driven login flows for ACP agents | v1.1.1-beta.3 | **Argos** — acp-runtime; builds on `acp-auth-method-labels` work | M | Matters for CLI-first agent auth |
| 14 | Cron-expression scheduled tasks (scheduler runtime, delivery routing, agent tool) replacing one-time/daily/weekly enum | v1.0.8 | **Argos** — scheduled-tasks service (see `scheduled-tasks-loading-loop`) | M | Current enum is workable; medium priority |
| 15 | Streaming render stability — split rendering + prefix batching / worker-pool concept to reduce markdown stalls | v1.1.1-beta.3/4 | **Argos renderer** — concept port only (source is Vue/markstream) | M | See `react-scroll-area-update-loop`, `chat-scroll-windowing` |

## Horizon 3 — later (strategic bets)

| # | Item | Source | Owner / landing spot | Effort | Notes |
|---|------|--------|----------------------|--------|-------|
| 16 | **Argos CLI** — thin local client for agent runs, provider/model admin, settings, skills, MCP ops | v1.1.0 | **Argos control plane** — daemon already exposes authenticated `/api/v1/route` + `/api/v1/events`; reuse `client-sdk`. Descriptor-file + bearer over socket/named pipe like the source, but pointed at our daemon | M–L | Better fit here than in the source: our headless-server story is first-class. Control-plane only — no harness coupling |
| 17 | Programmatic tool access for agents/scripts — grants, bounded batches, trusted discovery | v1.1.0 | **Re-scoped**: the source's `CLI_SURFACE_V3` is harness-integral (journal facts, View surfaces). With Pi, design a small Argos-owned surface: expose selected agent tools over the daemon control plane with scoped tokens. **Depends on #16** | L | Different design; keep the grant/quota *ideas*, drop the machinery |
| 18 | **Multi-agent collaboration v2** — child sessions, progress controls, result handoff, durable execution journaling, contract-bound delegation recovery | v1.1.0 | **Pi extensions** — Orchi already exists as `pi-orchestrator-extension`; take the source's *patterns* (durable journal, delegation-recovery contract, live child-session UX) and design them as orchestrator-extension + daemon session capabilities | XL | Not a port. The journaling/recovery contracts are the transferable ideas |
| 19 | **Offline OCR** (Light OCR) for image/PDF attachments — per-attachment Auto/Text/OCR, cancellation, caching, page-aware truncation, reuse across history/retry/export/search | v1.0.5→v1.1.0 | **Argos** — attachment pipeline + runtime bundling. Source pins Node ≥24.18 + `NODE_MODULE_VERSION 137`; our runtime is Bun-based — needs its own binding story | M–L | `binaryReadGuard` currently tells agents to OCR elsewhere; real OCR would be a differentiator |
| 20 | Agent run modes (code/minimal), configurable output limits, persistent composer drafts, Windows shell profiles | v1.1.1-beta.1 / v1.1.0 | **Adopt from Pi** for modes (Pi has a modes/extensions concept — check via `pi-update`); output limits/drafts/shell profiles are **Argos** (agent config, composer, exec host) | S–M | Pi-first for the mode semantics; UX is ours |
| 21 | DeepSeek native web search with per-turn toggle + source links | v1.1.0-beta.12 | **Argos** — provider options in our provider-execution layer + composer toggle | S–M | We already ship in-memory web-search MCP servers; native search is incremental |

## Watch / low fit

- **Codex image generation for providers** (v1.1.1-beta.4) — we have image gen; fold in if the Codex runtime (#1788, still pending) ever lands.
- **Provider/settings UI redesigns** (v1.1.1-beta.2 sidebar) — Vue-specific; our settings redesign is ahead via T3-style work.
- **Computer Use driver 0.19.x** (snapshot targeting, post-action verification, PiP) — plugin-level; tracked separately (`cua-driver-v0-2-0-sync`).
- **markstream-vue / stream-monaco** — Vue-only, permanent skip.
- **Source harness internals** (loop runner, compaction service, tool-surface controller, context coordinator, CLI_SURFACE_V3 journal) — **structural skip**; Pi owns this layer.
- **Feishu/Lark install auth + streaming card delivery** — we carry Telegram/QQBot/Discord/WeChat; add only with user demand.
- **Linux ARM64 packaging, macOS branded installer, updater hardening** — release-engineering time (`argos-release` skill).
- **Plugins Hub main-window, McDonald's MCP server, MCP v2 ecosystem** — vague in the changelog; inspect source when relevant.

## Open fork issues that map to this roadmap

- `runtime-install-bun-x-failure`, `skills-path-cross-platform-repair`, `mcp-server-start-regression` → #12 managed toolchains
- `memory-backend-wiring` → #8 memory v2
- `scheduled-tasks-loading-loop` → #14 cron jobs
- `acp-auth-method-labels` → #13 ACP terminal auth
- `react-scroll-area-update-loop`, `merged-activity-groups` → #15 streaming render stability
- `remove-gpt5-temperature-hardcode` (done) → same family as #5
- `usage-dashboard-empty-state` → calendar-day hover redesign (v1.0.9) is a nice reference
- `image-generation-context-budget-bypass` → source fixed this class in v1.0.5-beta.1 — worth a diff look

## Suggested sequencing

0. **Run the `pi-update` review first** — establish what Pi 0.84+ already covers
   (compaction behavior, modes, retry semantics) so items 4, 5, 9, 20 land on
   the right side of the seam. Contribute loop fixes to Pi upstream, not here.
1. Horizon 1 items 1, 2, 5, 7 (provider robustness batch — one SDD folder, 2–3 PRs).
2. Item 6 (prompt-cache stability) — small change, large cost win.
3. Item 8 (memory v2) — 4-PR SDD split like the original memory integration.
4. Items 11 + 12 (MCP OAuth, managed toolchains) — independent, parallelizable.
5. Item 10 (tool catalog bounding) once MCP runtime work from 2/11 settles.
6. Item 16 (CLI) as the flagship "later" bet — it compounds with 17.

Carry-over pending from `sync-state.md`: #1787 directory/environments management,
#1777 workspace single-item viewer, #1788 Codex runtime (deferred by decision).
