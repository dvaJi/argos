# Contributing to Argos

We love your input! We want to make contributing to Argos as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Internal Team Contributors

#### Bug Fixes and Minor Feature Improvements

- Develop on `master` (this fork has a single integration branch; there is no `dev`/`main`).
- Code submitted to `master` must ensure:
  - Basic functionality works
  - No compilation errors
  - Project can start normally with `bun run dev`

#### Major Features or Refactoring

- Create a new feature branch named `feature/featurename` off `master`.
- Open a Pull Request against `master` and merge it upon completion.

#### Maintainer Release Flow

- `master` is the integration branch.
- Cut a short-lived `release/<version>` branch from an existing commit on `master`.
- macOS and Linux maintainers land the release with `bun run release:ff -- release/<version> --tag v<version>`.
- Windows maintainers must use the documented manual release steps instead of `bun run release:ff`.
- Create the release tag on the same commit after `master` has been fast-forwarded.
- See [docs/release-flow.md](./docs/release-flow.md) for the full maintainer procedure, manual fallback, and guardrails.

### External Contributors

1. Fork this repository to your personal account
2. Create your development branch from `master`
3. Develop in your forked repository
4. Submit a Pull Request to the `master` branch of this repository
5. Describe the Issues fixed in your PR description (if applicable)

## Local Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/dvaJi/argos.git
   cd argos
   ```

2. Install required development tools:

   - Install [Bun](https://bun.sh/) (version >= 1.3.14)

3. Additional setup based on your operating system:

   **Windows:**

   - Install Windows Build Tools:
     GUI Installation:
     - Install [Visual Studio Community](https://visualstudio.microsoft.com/vs/community/)
     - Select "Desktop development with C++" workload during installation
      - Ensure "Windows 10/11 SDK" and "MSVC v143 build tools" components are selected (Visual Studio 2022 recommended)
   - Install Git for Windows

   **macOS:**

   - Install Xcode Command Line Tools:
     ```bash
     xcode-select --install
     ```
   - Recommended: Install Homebrew package manager:
     ```bash
     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
     ```

   **Linux:**

   - Install required build dependencies:
     ```bash
     # Ubuntu/Debian
     sudo apt-get install build-essential git
     # Fedora
     sudo dnf groupinstall "Development Tools"
     sudo dnf install git
     ```

4. Install project dependencies:

   ```bash
   bun install
   bun run installRuntime
   # if you hit `No module named 'distutils'`:
   pip install setuptools
   ```

   > **Windows:** Enable Developer Mode so the installers can create symlinks.

5. Start the development server:
   ```bash
   bun run dev
   ```

## Project Structure

Argos is a Turborepo monorepo. The desktop app is an Electron **shell** that loads its UI over HTTP from the local daemon; `@argos/ui` is a standalone, reusable web package.

- `apps/desktop/src/main/`: Electron main process (the **shell**) — presenters (window/tab/thread/config/llmProvider/mcp/...), typed route handlers, runtime orchestration, and the EventBus.
- `apps/desktop/src/preload/`: Secure IPC bridge (contextIsolation on). Exposes the typed `window.argos` hybrid bridge → `packages/client-sdk` (WebSocket→daemon for routes, IPC→main for native-only routes).
- `apps/daemon/` (`@argos/daemon`): Backend server (Bun) that serves the `@argos/ui` build over HTTP and exposes `/api/v1/route` + `/api/v1/events`.
- `packages/ui/` (`@argos/ui`): React 19 + TanStack Router frontend. App code in `src/` (components, stores, pages, lib); UI↔backend boundary in `api/` (typed `*Client` classes). Secondary renderers: `settings/`, `floating/`, `splash/`, `browser-overlay/`, `web/`.
- `packages/ui/shadcn/`: shadcn/ui components shared across renderers.
- `packages/shared-contracts/` (`@argos/shared-contracts`): Zod-validated route contracts, event contracts, the `ArgosBridge` interface, and the `ARGOS_ROUTE_CATALOG`.
- `packages/shared/` (`@argos/shared`): Shared types and utilities (web-safe).
- `packages/backend-core/`, `packages/{acp,mcp,skills,memory,remote-control}-runtime/`, `packages/agent-runtime/`, `packages/pi-orchestrator-extension/`: Shared backend logic and host-port-injected runtimes.
- `apps/landing/`: Marketing site + GitHub OAuth relay (Cloudflare Worker).
- `runtime/`: Bundled runtimes used by MCP and agent tooling (Bun/uv/ripgrep/rtk) — installed via `bun run installRuntime`.
- `scripts/`, `resources/`, `build/`: Build, packaging, and asset pipelines.
- `dist/`, `out/`: Build outputs (do not edit manually).
- `docs/`: Design docs, guides, and the SDD spec/plan/task records.
- `apps/desktop/test/`: Vitest suites (`test/main`, `test/renderer`) mirroring source.

See `AGENTS.md` for the path-alias table (`#/`, `#api`, `@argos/shared`, ...) and the renderer-main route/client pattern.

## Architecture Overview

### Design Principles

- **Desktop is a shell, daemon is the backend**: `@argos/desktop` (Electron main + preload) loads its UI over HTTP from the local `@argos/daemon` (Bun). The daemon serves the `@argos/ui` build and exposes `/api/v1/route` + `/api/v1/events`.
- **Typed route/client boundary**: New renderer business code goes through Zod-validated route contracts (`packages/shared-contracts`), the `ArgosBridge`, typed `*Client` classes (`packages/ui/api/`), and named runtime wrappers. Do not treat presenter names as a public renderer API.
- **Presenters stay in main**: Presenters still own most main-process capabilities, but on active paths they are an implementation detail behind routes, events, and wrappers. `packages/ui/api/legacy/` is quarantine-only compatibility code (max 3 files).
- **Multi-window + multi-tab shell**: WindowPresenter and TabPresenter manage true Electron windows/BrowserViews with detach/move support; an EventBus fans out cross-process events.
- **Clear data boundaries**: Chat data lives in SQLite, settings in Electron Store, knowledge/memory in DuckDB, and backups via SyncPresenter. The renderer never touches the filesystem directly.
- **Tooling-first runtime**: Provider execution handles streaming, rate limits, and provider instances (cloud/local/ACP agent). The MCP runtime boots MCP servers, the router marketplace, and in-memory tools with a bundled Bun runtime.
- **Safety & resilience**: `contextIsolation` is on; renderer-side OS/file/network access is gated behind typed bridges or quarantined wrappers; backup/import pipelines validate inputs; rate-limit guards prevent provider overload.

```
┌─────────────────────────────────────────────────────────────┐
│            @argos/daemon (Bun) — backend server             │
│  /api/v1/route (typed routes) + /api/v1/events (WebSocket)  │
│  Serves @argos/ui build · provider/MCP/ACP/memory/sync      │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP / WebSocket
┌───────────────▼─────────────────────────────────────────────┐
│        @argos/desktop — Electron main (the shell)           │
│  Presenters + routes + runtime owners + persistence         │
│  window/tab/thread/config/llm/mcp/sync/... · EventBus       │
└───────────────┬─────────────────────────────────────────────┘
                │ Secure IPC (contextIsolation on)
┌───────────────▼─────────────────────────────────────────────┐
│  Preload → packages/client-sdk (window.argos hybrid bridge) │
│  WebSocket→daemon for routes · IPC→main for native-only     │
└───────────────┬─────────────────────────────────────────────┘
                │ typed clients / runtime wrappers
┌───────────────▼─────────────────────────────────────────────┐
│      @argos/ui (React 19) — api/*Client + wrappers          │
│  quarantine: api/legacy/**  ·  business: src/**             │
└─────────────────────────────────────────────────────────────┘
```

### Domain Modules & Feature Notes

- **LLM pipeline**: Provider execution orchestrates providers with rate-limit guards, per-provider instances, model discovery, custom model import, Ollama lifecycle, embeddings, and the agent loop (tool calls, streaming states). Most of this now runs daemon-side on Pi.
- **MCP stack**: The MCP runtime uses ServerManager/ToolManager to start/stop servers, choose package registries, auto-start default/builtin servers, and surface tools/prompts/resources. Supports StreamableHTTP/SSE/Stdio transports and a debugging UI.
- **ACP (Agent Client Protocol)**: ACP providers spawn agent processes, map notifications into chat blocks, and feed the **ACP Workspace** (plan panel, terminal output, guarded file tree requiring `registerWorkdir`).
- **Skills**: Install from folders/ZIPs/URLs; enable per conversation; import/export with Claude Code, Codex, Cursor, Windsurf, Copilot, and more.
- **Knowledge, memory & search**: DuckDB/vector pipelines for memory search (FTS + HTTP embeddings) and knowledge bases; search assistants auto-select models.
- **Remote control**: Drive sessions from Telegram, Discord, Feishu/Lark, QQBot, and WeChat iLink via the remote-control runtime.

## Best Practices

- **Use typed clients and runtime wrappers from UI business code**: In `packages/ui/src/**`, prefer `packages/ui/api/*Client`, typed event helpers, and named runtime wrappers. Do not import `#api/legacy/presenters` or add new presenter-name-based transport there.
- **Do not use Node APIs in the renderer**: All OS/network/filesystem work should go through `window.argos`, typed clients, or explicitly named wrappers. Keep features multi-window-safe by scoping state to `tabId`/`windowId`.
- **State & UI**: Favor TanStack Store and composition utilities; keep components stateless where possible and compatible with detached tabs. Consider artifacts, variants, and streaming states when touching chat flows.
- **LLM/MCP/ACP changes**: Respect rate limits; clean up active streams before switching providers; prefer typed events on migrated paths instead of adding new raw IPC or presenter reflection. For MCP, persist changes through main-owned config/runtime layers and surface server start/stop events. For ACP, always call `registerWorkdir` before reading the filesystem and clear plan/workspace state when sessions end.
- **Data & persistence**: Route conversation/settings/provider/backup changes through main-owned clients or compatibility adapters; do not write directly into `appData` or other local stores from the renderer.
- **Testing & quality gates**: Before sending a PR, run `bun run format`, `bun run lint`, `bun run typecheck`, and relevant `bun test*` suites.

## Code Style

- TypeScript + React 19 + TanStack Router + TanStack Store; Tailwind CSS + shadcn/ui for styling.
- Oxfmt enforces double quotes, semicolons, width 120, and trailing commas; `bun run format` before committing.
- OxLint is used for linting (`bun run lint`). Type checking via `bun run typecheck` (node + web targets).
- Tests use Vitest, split into `apps/desktop/test/main` and `apps/desktop/test/renderer`. Name tests `*.test.ts`/`*.test.tsx`/`*.spec.ts`.
- Follow naming conventions: PascalCase components/types, camelCase variables/functions, SCREAMING_SNAKE_CASE constants.

## Pull Request Process

1. Keep PRs focused; describe what changed and which issues are addressed.
2. Include screenshots/GIFs for UI changes and note any docs updates (README/CONTRIBUTING/docs).
3. Verify format + lint + typecheck + relevant tests locally; note anything not run.
4. Target the `master` branch; external contributors should fork-first and open PRs against `master`.
5. At least one maintainer approval is required before merge.
6. Releases are cut from short-lived `release/<version>` branches and landed on `master` with the documented `ff-only` flow in [docs/release-flow.md](./docs/release-flow.md).

## Any Questions?

Feel free to open an issue with the tag "question" if you have any questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the project's license.
