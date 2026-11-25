# Agent Workspace and Self-Discovery — Deep Dive

How to give each Argos agent a durable identity, layered instructions, and a way to look up the harness's own capabilities without carrying documentation in context.

Reference: Pine `docs/references/agents.md`, `setup.md`, `configuration.md`, and `src/{agents.ts,manual.ts,admin.ts,agent-admin.ts}`.

## Why this matters

Argos already has the raw pieces: per-agent Pi profiles at `<dataDir>/agents/<id>/pi`, system prompts, a memory runtime, skills, and orchestration tools. What it lacks is a coherent *workspace model*:

- Where does an agent's purpose live?
- Which files are instructions, which are notes, and which are user-protected?
- How does an agent learn what it can do without a human pasting docs?
- How does an agent change its setup without editing config files?

Pine's answer is a small set of named files plus admin tools plus a BM25 manual. The mechanism is worth borrowing; the file-first config philosophy is not.

## Agent as a folder

Pine's layout, adapted to Argos:

```text
<dataDir>/
  AGENTS.md                  global traits and behavior
  TOOLS.md                   global tooling defaults and preferences
  USER.md                    what every agent knows about the owner
  agents/
    <agentId>/
      agent.json             optional settings mirror (daemon owns the real config)
      workspace/             the agent's private working folder
        AGENTS.md            its purpose and how it works
        SOUL.md              character and tone
        TOOLS.md             its own tool defaults and technical notes
        MEMORY.md            what should outlive a conversation
      AGENTS.md              optional: user rules the agent cannot change
      SYSTEM.md              optional: replaces the base prompt for this agent
      skills/                agent-scoped skills
      conversations/         conversation-scoped setup (skills, sources)
      extensions/            agent-scoped Pi extensions
      sandbox/               private home / generated sandbox profile
```

Argos already has the profile root and skill management. Add the workspace and global instruction files alongside it; do not restructure the existing profile.

## Instruction layering

Prompt assembly order (top wins for conflicts):

1. Harness base prompt (Pi/Argos defaults).
2. Global `AGENTS.md` (traits and behavior for all agents).
3. Global `TOOLS.md` (tool defaults for all agents).
4. Global `USER.md` (owner facts).
5. Per-agent `AGENTS.md` (purpose and how it works).
6. Per-agent `SOUL.md` (identity and tone).
7. Per-agent `TOOLS.md` (overrides and technical notes).
8. Per-agent `MEMORY.md` (durable facts).
9. Project `AGENTS.md` / `CLAUDE.md` for the session's workspace, when trusted.
10. Session system prompt / per-agent `SYSTEM.md` override, if configured.

Rules:

- Missing files are skipped, not stubbed with empty headings.
- Every file has a size cap (default 8k chars each, 24k total for instruction files). Exceeding the cap truncates with a visible warning and a suggestion to move detail into a skill or memory entry.
- `MEMORY.md` has a lower soft cap (~6k) and the agent is reminded to consolidate when it grows.
- Only the named files at the top of the workspace are read as instructions. Other files are notes the agent reads on demand.
- The assembled block is labeled by source, so the model can tell a global rule from a per-agent rule.
- Changes apply from the next message, not mid-turn.
- The prompt assembly is deterministic and snapshot-tested.

### Who writes what

| File | Agent | Owner | Notes |
|---|---|---|---|
| Global `AGENTS.md` | no | yes | Only the main/administrator agent may edit via an admin tool, with confirmation |
| Global `TOOLS.md` | no | yes | Main agent may edit with confirmation |
| Global `USER.md` | no | yes | Main agent may edit with confirmation |
| Per-agent `AGENTS.md` | yes | yes | The agent's own purpose; owner can edit |
| Per-agent `SOUL.md` | yes | yes | Agent identity; main agent can edit another agent's with confirmation |
| Per-agent `TOOLS.md` | yes | yes | Tool preferences |
| Per-agent `MEMORY.md` | yes | yes | Agent's own memory |
| Per-agent `AGENTS.md` (protected) | no | yes | User rules the agent reads but cannot change |

Pine calls the last one "AGENTS.md in the agent folder" and the workspace one "workspace/AGENTS.md". Argos should avoid two files with the same name in confusing locations. Proposed naming:

- `<dataDir>/AGENTS.md` — global.
- `<dataDir>/agents/<id>/workspace/AGENTS.md` — agent-authored.
- `<dataDir>/agents/<id>/RULES.md` — user-protected rules (rename from Pine's second `AGENTS.md`).

This removes the ambiguity while preserving the layering.

## Memory integration

Argos already has a memory subsystem (`packages/memory-runtime`) with SQLite + FTS5 + optional vectors, extraction, decision models, and a token-budgeted injection port. Do not build a second memory store.

The split:

- **`MEMORY.md`** is the agent's compact, human-readable working memory: decisions, preferences, open ends. It is prompt-level and small.
- **The memory runtime** is the searchable long-term store: extracted facts, task outcomes, heuristics, anti-patterns, with retrieval scoring.
- On each turn, inject retrieved memory within a token budget *and* include `MEMORY.md`.
- The agent writes durable facts with `memory_remember`; it writes short working notes to `MEMORY.md`.
- A consolidation job may propose moving `MEMORY.md` entries into the memory store when the file approaches its cap.
- The existing memory injection port is currently not wired into `pi-provider-execution.ts`; wiring it is a prerequisite for this layer to be coherent.

Do not duplicate Pine's "memory file" idea as a replacement for the memory subsystem. Use it as the human-readable surface.

## Manual / self-discovery

Pine ships a `manual` tool: BM25 search over its own docs, returning the matched part and a snippet. Agents search before saying something is impossible.

Argos equivalent:

- Index `docs/**/*.md`, `README.md`, `AGENTS.md`, and the bundled guides. Exclude `docs/archives/**` and release notes by default.
- Build an FTS5 table at daemon start (or lazily on first search) with fields: path, title, heading, body, anchor.
- Tool: `argos_manual_search({ query, limit? })` returns ranked sections with path, heading, and a short snippet.
- Optional `argos_manual_read({ path, anchor? })` returns the section, capped.
- The tool description tells the agent to search before answering questions about Argos's capabilities, routes, commands, or configuration.
- Keep the index build fast: chunk by heading, strip code fences for indexing but keep them in results.
- Invalidate on file change with a debounce; a full rebuild is acceptable for a few thousand docs.
- Respect the current docs retention rules; do not index archived or stale SDD folders by default.

This is a high-value, low-risk feature. It also makes the growing `docs/` tree useful to agents rather than only to humans.

## Admin tools

Pine's rule: agents never edit config files; they call tools that validate, ask, and write. Argos already follows this for projects, agents, MCP, and skills. Extend the same pattern to automation.

| Tool | Scope | Confirmation |
|---|---|---|
| `argos_source_add` / `argos_source_remove` | conversation (default), agent, global (main agent only) | Always for a new external surface; not for removing the conversation's own |
| `argos_subscribe` / `argos_unsubscribe` | conversation, agent, global | Conversation subscription: no; agent/global: yes |
| `argos_schedule_add` / `argos_schedule_remove` | conversation, agent, global | Conversation/own agent: no; other scope: yes |
| `argos_route_add` / `argos_route_remove` | conversation, agent, global | Yes for global; no for conversation |
| `argos_mcp_add` / `argos_mcp_remove` | conversation, agent, global | Always for add; yes for removing another scope |
| `argos_skill_add` / `argos_skill_remove` | conversation, agent, global | Conversation/own agent: no; other scope: yes |
| `argos_set_setting` | global only | Always |
| `argos_create_agent` / `argos_update_agent` / `argos_remove_agent` | main agent only | Always |
| `argos_manual_search` | any | No |

Design rules:

- One Zod schema per resource, shared by the tool and the route.
- The tool returns what it changed, in plain words, and which scope it applied to.
- A missing scope means conversation, never global.
- The tool refuses to write daemon config files directly; it calls the same service as the route.
- Removing a resource removes exactly the rows it created; no stale references.
- In plan mode, all mutating admin tools are refused without a prompt.
- In a restricted run, all admin tools are absent.

### Agent creation

Borrow Pine's flow but keep Argos's confirmation:

1. The main agent proposes an id, purpose, model, mode, tools, and initial `AGENTS.md`.
2. The user confirms.
3. The daemon creates the profile, workspace stubs, and an initial conversation.
4. The new agent is available immediately, no restart.

Do not copy Pine's "agent introduces itself on first meeting" by default. If Argos wants it, make it a one-line system note, not a mandatory paragraph that every agent must produce.

## Config boundary

Pine closes its home folder to agents entirely and exposes tools instead. Argos should follow the rule, not necessarily the filesystem enforcement:

- Agents cannot read or write `<dataDir>/config.json`, provider credentials, `.env`, or other agents' profiles.
- Agents can read and write their own workspace files.
- Global instruction files are writable only by the main agent, with confirmation.
- The daemon is the single source of truth for configuration. The workspace files are instructions, not config.
- If an agent needs a setting that has no tool, it tells the user where to change it; it does not edit files.

## UI surfaces

- Agent settings: purpose (`AGENTS.md`), identity (`SOUL.md`), tool notes (`TOOLS.md`), memory (`MEMORY.md`), protected rules (`RULES.md`), with a preview of the assembled prompt and size indicators.
- A "What this agent can do" panel derived from the resolved tool profile and scoped resources.
- A manual search box in the agent settings and a "Search docs" action in the command palette.
- A diff/preview before saving a global instruction file.
- A warning when an instruction file exceeds its cap or `MEMORY.md` needs consolidation.

## Test plan

- Prompt assembly: deterministic order, source labels, missing files, size caps, `SYSTEM.md` override.
- Protected files: agent write attempts are rejected; owner writes succeed.
- Memory: `MEMORY.md` included; retrieval injected within budget; no duplicate storage.
- Manual: index build, heading-aware snippets, stale-index invalidation, archived docs excluded.
- Admin tools: scope defaults, confirmation rules, plan-mode refusal, restricted-profile absence.
- Agent creation: stubs, initial conversation, no restart, cleanup on remove.
- Config boundary: agent cannot read credentials or other agents' profiles.

## Open questions

1. Should `RULES.md` replace Pine's second `AGENTS.md`, or should Argos keep both names for compatibility with existing project conventions? Recommendation: use `RULES.md` to avoid ambiguity.
2. Should global instruction files be editable from the desktop settings UI only, or also from the main agent? Recommendation: both, with confirmation and a diff preview.
3. How much of `MEMORY.md` should be injected when the memory runtime already retrieves facts? Recommendation: include the whole file up to the cap; it is the agent's working set.
4. Should the manual index include `docs/features/**` and `docs/architecture/**`, or only stable guides? Recommendation: index stable guides and current architecture; exclude active SDD folders by default to avoid stale plans.
5. Should agents be able to create other agents? Recommendation: only the main/administrator agent, with user confirmation.
