# Daemon Provider & Model Backend

## User Need

The desktop app is meant to be a thin shell: in headless/remote mode the UI talks to the
**daemon**, which is the real backend. Today, provider + model management is split:

- The desktop `LLMProviderPresenter` (in `apps/desktop/src/main/presenter/llmProviderPresenter`)
  has a mature `providerRegistry` + `modelSource` strategy + provider-DB catalog fallback.
- The daemon (`apps/daemon/src/host/daemonConfigPresenter.ts`) has a **naive, divergent**
  implementation: `refreshProviderModels` always calls `${base}/v1/models` and has no
  `modelSource`/provider-DB awareness.

In headless mode the UI's `providers.refreshModels` is delegated to the daemon (see
`apps/desktop/src/main/routes/providers/providerRouteHandler.ts:82-85`), so the daemon's
broken implementation runs — and DeepSeek (and any provider without a `/models` endpoint)
fails with `Authentication Fails (auth header format should be Bearer sk-...)`.

The user's principle: **desktop must use the daemon for almost everything** — the daemon is
the single source of truth for backend behavior; the desktop shell only bridges to it.

## Goal

Make the daemon the complete backend for provider + model management, and remove the
divergent local `LLMProviderPresenter` logic for those routes by:

1. Extracting the shared provider-registry / `modelSource` / provider-DB catalog into
   `@argos/backend-core` so desktop and daemon use **one** implementation.
2. Fixing the daemon's `refreshProviderModels` to use that shared logic (catalog fallback for
   providers without `/models`).
3. Routing every provider/model route through the daemon from the desktop shell
   (`invokeDaemonRoute`), keeping the desktop `providerRouteHandler` a thin delegate.

## Acceptance Criteria

- `providers.refreshModels` works for DeepSeek (and any provider without a `/models` endpoint)
  in a headless/daemon-only setup.
- The daemon no longer unconditionally calls `/v1/models`; it consults `modelSource`
  (`provider-db` / `openai` / etc.) and falls back to the provider-DB catalog.
- Provider + model route handlers in the desktop shell delegate to the daemon
  (`invokeDaemonRoute`) instead of calling a local `llmProviderPresenter` for those routes.
- Desktop and daemon share one provider-registry / provider-DB implementation (no duplicate
  `modelSource` logic).
- Headless e2e covers model refresh for an OpenAI-compatible provider and for DeepSeek.

## Constraints

- Reuse existing `@argos/backend-core` as the shared home for backend logic.
- Keep route contracts in `@argos/shared-contracts` unchanged (or extend minimally).
- Do not break the full Electron (shelled) app; desktop remains a working thin client.
- Preserve the provider-DB background refresh / caching behavior currently in desktop.

## Non-Goals (this issue)

- Migrating other presenters (sessions, agents, skills, sync, etc.) to the daemon pattern.
  This issue establishes the pattern using provider/model management only. (Other presenters
  may need their own follow-up issues using the same approach.)
- Changing chat/completion execution, which already runs in the daemon
  (`AiSdkProviderExecutionPort`).

## Open Questions

- `providers.getRateLimitStatus`, `listOllamaModels`, `listOllamaRunningModels`,
  `pullOllamaModel` currently use the **local** `llmProviderPresenter` (not delegated). Are
  these desktop-shell-specific (e.g. Ollama is often local to the machine running the shell),
  or should they also move to the daemon? Decide per-route during implementation.
- Should the desktop `LLMProviderPresenter`'s model-management code be deleted once delegation
  is complete, or kept as a fallback for offline shelled mode? Recommend: delete the
  duplicated model-fetch logic and keep only what the daemon does not own.
