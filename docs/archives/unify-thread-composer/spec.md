# Unify Thread Pages on One Composer

## User need

The three chat surfaces (`AgentWelcomePage`, `NewThreadPage`, `ChatPage`) each hand-roll a
composer with different structure, duplicated logic, and dead code. The welcome page and the
new-thread page are swapped on the same route and share ~80% of their logic, yet look and behave
differently (different model/mode controls, different submission rules, different gating). The
result looks broken and inconsistent. The target design is the OpenCode-style composer: one
rounded input card with a single footer row (attach + model/effort/mode chips left, primary
action right), and small context chips below (project / machine / worktree).

## Goal

- One shared composer component (`ThreadComposer`) used by all thread surfaces.
- `AgentWelcomePage` merges into `NewThreadPage` (the route already swaps them via
  `agentStore.selectedAgentId === null`).
- The welcome state stacks everything in **one centered column** (agent pill, headline, composer,
  context chips, recent-threads list) — no side lane (revised after user review of the first pass,
  which kept a two-column lane and looked disjoint when the list was empty).
- `ComposerFooterBar` (model / effort / mode pickers, backed by `draftStore` pre-session) becomes
  the single composer footer; `InputChipRow` and `ProjectScopeChip` are deleted.
- Dead code removed: voice-input leftovers, `insertRecognizedText`, `resolveChatModelByQuery`,
  no-op toolbar handlers, unused ref-type members, duplicated model-resolution and
  audio-attachment-filter logic.

## Acceptance criteria

1. `/chat` new-thread route renders one page (`NewThreadPage`) for both states:
   - no agent selected → welcome state: single centered column with the agent pill, the
     "What should we build…" headline, the composer, context chips, and the recent-threads
     list (self-hidden under two sessions);
   - agent selected → centered composer (same column, headline/switcher replaced by the
     topbar pill);
   - no agents enabled → "No agents set up yet" empty state with the
     `agent-welcome-manage-action` testid preserved.
2. `ChatPage` renders the same `ThreadComposer` (footer chips + attach left, send right).
3. Composer internals are identical across all three states: `ChatInputBox` with
   `ComposerFooterBar` in `footerLeft` and a compact `ChatInputToolbar` (steer + primary) right.
4. Submission behavior is consistent: audio-capability attachment filtering works on every
   surface; model resolution exists once; ACP workdir gating exists once.
5. E2e-relevant test ids survive: `new-thread-page`, `chat-page` + `data-generating`,
   `chat-input-box`, `chat-input-editor`, `chat-send-button` / `chat-queue-button` /
   `chat-stop-button`, `composer-footer-bar`, `composer-model-picker`, `agent-welcome-switcher`.
6. `bun run typecheck`, `bun run lint`, `bun run format:check` pass.

## Constraints

- No route or `pageRouter` changes; the `newThread`/`chat` split stays.
- Keep `draftStore` as the pre-session selection store; `ComposerFooterBar` pickers already
  read/write it.
- Keep ACP draft-session, worktree, project-validation, and guided-onboarding behavior in
  `NewThreadPage`.
- Keep `ChatStatusBar` on new-thread (it owns pre-session ACP config options, system prompt,
  subagent toggle) with `composerFooterActive` so nothing renders twice.

## Non-goals

- Rewriting `ChatStatusBar` internals or `MessageList`/`ChatTopBar`.
- Removing the legacy onboarding `WelcomePage`.
- Implementing voice input (the dead stub is deleted, not finished).

## Open questions

None — user decisions recorded: merge welcome into new-thread; keep the recent-threads lane;
`ComposerFooterBar` everywhere.
