# Repository Guidelines

Use the fff MCP tools for all file search operations instead of default tools.

## Project Structure & Module Organization

The UI is extracted from the desktop shell (CodeNomad-style): the desktop app is an Electron shell that loads its UI over HTTP from the local daemon, and `@argos/ui` is a standalone, reusable web package.

- `apps/desktop/src/main/`: Electron main process (the **shell**); presenters in `presenter/` (Window/Tab/Thread/Mcp/Config/LLMProvider), `eventbus.ts` for app events. Windows load UI routes from the local daemon via `lib/daemonUi.ts` (`resolveUiUrl`).
- `apps/desktop/src/preload/`: Secure IPC bridge (contextIsolation on). Typed `window.argos` **hybrid bridge** via `createBridge.ts` → `packages/client-sdk` (WebSocket→daemon for routes, IPC→main for native-only routes).
- `packages/ui/` (`@argos/ui`): the **React 19 + TanStack Router frontend** — built independently to `dist/`, served by the daemon. App code in `src/` (`components/`, `stores`, `pages`, `lib`); secondary renderers `settings/`, `floating/`, `splash/`, `browser-overlay/`, `web/`. UI↔backend boundary in `api/` (typed `*Client` classes); `api/legacy/` is quarantine-only compatibility code (max 3 files).
- `packages/ui/shadcn/`: shadcn/ui components shared across renderers.
- `packages/shared-contracts/` (`@argos/shared-contracts`): Shared route contracts (Zod-validated), event contracts, the `ArgosBridge` interface, and the `ARGOS_ROUTE_CATALOG`.
- `packages/shared/` (`@argos/shared`): Shared types and utilities (web-safe; no hard electron dependency).
- `apps/daemon/` (`@argos/daemon`): Backend server (Bun) that serves the `@argos/ui` build over HTTP and exposes `/api/v1/route` + `/api/v1/events`.
- `apps/desktop/test/` (`test/main`, `test/renderer`) and `packages/ui`: Vitest suites with setup files.
- `scripts/`: Build/signing/runtime installers, architecture guards, commit checks.
- Build outputs/assets: `build/`, `resources/`, `out/`, `dist/`.

## Build, Test, and Development Commands
- Install: `bun install` + `bun run installRuntime` (first time).
- Dev: `bun run dev` (HMR). Inspect: `bun run dev:inspect`; Linux: `bun run dev:linux`.
- Preview: `pnpm start`.
- Type check: `bun run typecheck` (or `typecheck:node` / `typecheck:web`). Uses `tsgo` (native TS preview).
- Lint: `bun run lint` (runs `agent-cleanup-guard`, `architecture-guard`, then `oxlint`).
- Format: `bun run format` (oxfmt). Check: `bun run format:check`.
- After completing a feature, always run `bun run format` and `bun run lint`.
- Test: `bun test`, `test:main`, `test:renderer`, `test:coverage`, `test:watch`, `test:ui`.
- Build: `bun run build` then `build:win|mac|linux` (add `:x64|:arm64`).

## Turborepo + Vite + Electron Development

For agent-driven development with long-running Vite/Electron processes, follow these patterns:

### Agent Dev Workflow

Never run dev servers in the foreground. Use background processes with log capture:

```bash
# Start the dev command in background, redirect logs
bun run dev > /tmp/desktop-dev.log 2>&1 &
echo $! > /tmp/desktop-dev.pid

# Wait for Vite readiness (poll the @argos/ui dev server)
for i in {1..60}; do
  curl -fsS http://127.0.0.1:5180 >/dev/null && break
  sleep 1
done

# Inspect logs (never assume a long-running command is stuck)
tail -n 200 /tmp/desktop-dev.log
```

### Electron Readiness Checks

Two readiness states matter:
1. **Vite renderer ready**: Poll `http://127.0.0.1:5180` (the `@argos/ui` dev server; it proxies `/api` → daemon)
2. **Electron process launched**: Check logs for errors

In dev, the desktop shell loads windows from the `@argos/ui` dev server when `VITE_DEV_SERVER_URL` is set; otherwise (and in packaged builds) it loads from the local daemon (`http://127.0.0.1:<port>`).

### Stopping Dev Servers

```bash
kill $(cat /tmp/desktop-dev.pid)
```

### Key Rules
- Never run dev servers in the foreground
- Never assume a long-running dev command is stuck; Vite/Electron tasks are persistent by design
- Use `--filter` with Turbo to avoid running all dev servers at once
- Check logs before assuming failure

### Monorepo Packages

| Package | Path | Dev Command | Notes |
|---------|------|-------------|-------|
| `@argos/desktop` | `apps/desktop/` | `bun run dev` | Electron **shell** only (main + preload); loads UI from the daemon (Vite 8 + vite-plugin-electron + Rolldown) |
| `@argos/ui` | `packages/ui/` | `bun run --filter @argos/ui dev` | React 19 frontend; builds to `dist/`, served by the daemon (no electron dependency) |
| `@argos/daemon` | `apps/daemon/` | `cd apps/daemon && bun run dev` | Backend server (Bun); serves the UI + `/api/v1/route` + `/api/v1/events` |
| `@argos/backend-core` | `packages/backend-core/` | — | Shared backend logic |
| `@argos/acp-runtime` | `packages/acp-runtime/` | — | ACP runtime (process/session/registry, host-port injected) |
| `@argos/mcp-runtime` | `packages/mcp-runtime/` | — | MCP runtime (client/server/tools, host-port injected) |
| `@argos/skills-runtime` | `packages/skills-runtime/` | — | Skills runtime (discovery/install/metadata, host-port injected) |
| `@argos/client-sdk` | `packages/client-sdk/` | — | Client SDK (IPC bridge implementation) |
| `@argos/electron-adapter` | `packages/electron-adapter/` | — | Electron utilities |
| `@argos/shared-contracts` | `packages/shared-contracts/` | — | Shared types/contracts |
| `@argos/shared` | `packages/shared/` | — | Shared utilities |

## Renderer-Main Architecture (Typed Route/Client Pattern)

The codebase is migrating from legacy `useLegacyPresenter()` to a typed route/client pattern. **New code must use the typed pattern.**

### How it works

1. **Route contracts** (`packages/shared-contracts/src/routes/*.routes.ts`): Zod-validated input/output schemas per operation.
2. **Bridge** (`packages/shared-contracts/src/bridge.ts`): `ArgosBridge` interface with `invoke(routeName, input)` and `on(eventName, listener)`.
3. **Preload** (`apps/desktop/src/preload/createBridge.ts`): Creates the `window.argos` hybrid bridge (IPC for native-only routes; WebSocket→daemon for the rest).
4. **Typed Clients** (`packages/ui/api/*Client.ts`): Domain-specific clients (e.g., `ChatClient`, `ConfigClient`, `SessionClient`) that wrap `bridge.invoke()`.
5. **Runtime wrappers** (`packages/ui/api/runtime.ts`): Named helpers for clipboard, paths, external open — no `window.api` directly.

### Adding a new renderer-main capability

1. Define route in `packages/shared-contracts/src/routes/<domain>.routes.ts`
2. Add to `ARGOS_ROUTE_CATALOG` in `packages/shared-contracts/src/routes.ts`
3. Register route handler in `apps/desktop/src/main/routes/` (desktop) and/or `apps/daemon/src/dispatch/` (daemon)
4. Create or extend `packages/ui/api/<Domain>Client.ts`
5. Use the client from UI business code

### Legacy quarantine (`packages/ui/api/legacy/`)

- Only allowed place for `useLegacyPresenter()` and `window.electron`/`window.api` access
- Max 3 source files; additions require updating the architecture baseline
- The settings renderer (`packages/ui/settings/`) still imports from here — migration pending
- Business code under `packages/ui/src/` must **never** import from `#api/legacy/`

### Architecture guards

`bun run lint` runs two guard scripts before oxlint:
- `scripts/architecture-guard.mjs`: Enforces quarantine bounds, prevents legacy imports in business code, validates bridge register, tracks hot-path edges
- `scripts/agent-cleanup-guard.mjs`: Prevents new code from importing legacy presenter directories or `@argos/chat`

## Coding Style & Naming Conventions
- TypeScript + React 19 + TanStack Router; TanStack Store for state; Tailwind CSS + shadcn/ui for styles.
- Oxfmt: double quotes, semicolons, width 120, trailing commas. Run `bun run format`.
- OxLint for JS/TS; hooks run `lint-staged` and `typecheck`.
- Names: React components PascalCase (`ChatInput.tsx`); variables/functions `camelCase`; types/classes `PascalCase`; constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines
- Framework: Vitest (+ jsdom for renderer, node for main) and React Testing Library.
- Two separate configs: `vitest.config.ts` (main, node env) and `vitest.config.renderer.ts` (renderer, jsdom env).
- Location mirrors source under `test/main/**` and `test/renderer/**`.
- Names: `*.test.ts`/`*.test.tsx`/`*.spec.ts`. Coverage: `bun run test:coverage`.
- Test aliases match Vite aliases: `#` → UI src, `#api` → UI api, `@argos/shared` → shared.

## Path Aliases

Path aliases use the `#` prefix (Node subpath-imports style) for **internal** module references, and real workspace package names for cross-package references. This avoids colliding with npm scoped packages (`@scope/name`).

| Alias | `@argos/desktop` (main) resolves to | `@argos/ui` resolves to |
|-------|--------------------------------------|-------------------------|
| `#/` | `apps/desktop/src/main/` | `packages/ui/src/` |
| `#api` | — | `packages/ui/api/` |
| `#shadcn` | — | `packages/ui/shadcn/` |
| `#settings` | — | `packages/ui/settings/` |
| `@argos/shared` | `packages/shared/` | `packages/shared/` |
| `@argos/shared-contracts` | `packages/shared-contracts/` | `packages/shared-contracts/` |

The `#/` alias is context-sensitive: a custom Vite plugin (`createPathAliasPlugin` in each package's `vite-plugins/path-alias.ts`) resolves it to `src/main/` for desktop main-process files and `src/` for UI files. `@argos/shared` and `@argos/shared-contracts` are real workspace packages resolved via their `exports` maps (with `tsconfig` `paths` pointing at source for type checking).

## Commit & Pull Request Guidelines
- Conventional commits enforced by hook: `type(scope): subject` ≤ 50 chars; types: `feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release`.
- Do not include AI co-authoring footers in commits.
- PRs: clear description, link issues (`Closes #123`), screenshots/GIFs for UI, pass lint/typecheck/tests. Keep changes focused.
- Default PR base is `master` (this fork has a single integration branch; there is no `dev`/`main`). Use `gh pr create --base master` for routine feature, bugfix, docs, test, and refactor branches. Releases are cut from short-lived `release/<version>` branches and landed on `master` following `docs/release-flow.md`.
- UI changes: include BEFORE/AFTER ASCII layout blocks to communicate structure.

## Architecture Notes & Security
- Patterns: Presenter pattern in main; EventBus for inter-process events; typed route contracts as renderer-main boundary; two-layer LLM provider (Agent Loop + Provider); integrated MCP tools.
- Secrets: use `.env` (see `.env.example`); never commit keys.
- Toolchains: Bun 1.3.14. Windows: enable Developer Mode for symlinks.
- Build: Vite 8 with Rolldown; `vite-plugin-electron` multi-env for main/preload/renderer.
- Runtimes: bundled Bun, ripgrep, uv, rtk in `runtime/` — installed via `bun run installRuntime`.

## Specification-Driven Development

Follow the SDD methodology before changing code, tests, configuration, documentation, build scripts, or project structure. See [docs/spec-driven-dev.md](docs/spec-driven-dev.md).

Pure release metadata work does not require SDD. Version bumps, `CHANGELOG.md` updates, release branch management, tags, and release PR preparation should follow [docs/release-flow.md](docs/release-flow.md) without creating
`docs/features/*release*` folders.

Create one kebab-case folder per goal and keep `spec.md`, `plan.md`, and `tasks.md` together:

- `docs/features/<goal>/` for new features, user-visible capabilities, integrations, and tools.
- `docs/issues/<goal>/` for bug fixes, regressions, failing tests, CI failures, reliability issues, and prompt/runtime problems.
- `docs/architecture/<goal>/` for refactors, migrations, dependency boundaries, shared contracts, runtime architecture, and cross-module design.

Resolve every `[NEEDS CLARIFICATION]` item before implementation. Move completed or stale goal folders to `docs/archives/<goal>/`; delete documents that only describe removed code and have no reusable decision record.

Core principles: specification-first, architectural consistency, minimal complexity, compatibility/migration awareness.
