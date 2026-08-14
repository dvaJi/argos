# Real Agent Memory Implementation

## User Need

Long-term agent memory is largely inert in the current runtime. The `MemoryPresenter` /
`MemoryVectorStore` (DuckDB + `vss`) machinery exists, but it is only reachable from the
Settings → Agent → "Manage memory" dialog, and even that path never actually embeds memories.
Users cannot reliably create, recall, or manage memory, and agents cannot use memory during a
conversation.

As a user, I want memory to actually work end-to-end:

- Memories I add (or that agents record) get embedded into the DuckDB vector store and are
  semantically recalled across sessions.
- Agents in the daemon loop can persist and recall memory with dedicated tools.
- I can view, add, search, and remove memories from the main chat experience, not only buried in
  Settings.

## Goal

Make the agent memory feature fully functional in the daemon runtime and surface it in the UI:

1. Fix the daemon memory runtime so adding a memory triggers embedding, and the configured
   embedding model is respected.
2. Expose `memory_remember`, `memory_recall`, `memory_forget` agent tools to the daemon agent
   (Pi worker) loop, gated on the agent having memory enabled.
3. Start background maintenance (consolidation) for memory agents.
4. Add a memory management surface to the main chat UI and fix the broken props on the existing
   Settings dialog.

## Acceptance Criteria

- **Add → embed:** Calling the `memory.add` route (Settings or Chat UI) inserts a memory and
  drains its embeddings so its status transitions from `pending_embedding` to `embedded`
  (or `fts_only` when no embedding model is configured).
- **Correct embedding model:** `DaemonMemoryRuntime` requests embeddings with the agent's
  configured `memoryEmbedding.modelId`, not a hard-coded model.
- **Agent tools:** When an agent's config has `memoryEnabled === true`, the Pi worker receives
  `memory_remember`, `memory_recall`, and `memory_forget`; invoking them writes/recalls/deletes
  memories for that agent's session. When `memoryEnabled` is false/undefined, the tools are not
  exposed.
- **Background maintenance:** The daemon starts `MemoryPresenter.startBackgroundMaintenance()`
  so consolidation sweep runs for registered memory agents.
- **Chat UI:** The main chat top bar has a memory button that opens a memory manager for the
  active session's agent (add / list / search / delete / clear).
- **Settings UI:** The Memory dialog passes `memoryEnabled` and `hasEmbeddingConfigured`, so the
  disabled banner and the "embeddings not configured" banner behave correctly.

## Constraints

- Follow existing daemon tool patterns (modeled on `ArgosOrchestrationRuntime`): tool definitions
  are MCP-style and dispatched in `apps/daemon/src/index.ts` `listTools` / `callTool`, gated on
  agent config.
- Memory routes are not desktop-only; the renderer reaches them over the WebSocket bridge.
- Business code under `packages/ui/src` must not import from `#api/legacy`; importing the shared
  settings components via `#settings/components/...` is the established pattern.
- Must pass `bun run typecheck`, `bun run lint`, `bun run format`, and relevant tests.

## Non-Goals

- Automatic chat-message extraction (`MemoryPresenter.extractAndStore`) is not wired into the
  daemon loop in this change (agents write via explicit tools; the designer can add background
  extraction later).
- Persona evolution / reflection tuning beyond what the existing runtime already does.
- Migrating the desktop-only `ToolPresenter`/`AgentToolManager` memory duplicate; the daemon is the
  single host.

## Open Questions

- [RESOLVED] UI placement → Chat top bar + fixed Settings dialog (user selected).
- [RESOLVED] Tool gating → gate on agent `memoryEnabled` (user selected).
