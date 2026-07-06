# Repository Guidelines

Use the fff MCP tools for all file search operations instead of default tools.

## Project Structure & Module Organization
- `src/main/`: Electron main process; presenters in `presenter/` (Window/Tab/Thread/Mcp/Config/LLMProvider), `eventbus.ts` for app events.
- `src/preload/`: Secure IPC bridge (contextIsolation on). Typed `window.argos` bridge via `createBridge.ts` → `packages/client-sdk`.
- `src/renderer/`: React 19 + TanStack Router app. App code in `src/renderer/src` (`components/`, `stores`, `pages`, `lib`). Secondary renderers: `src/renderer/settings` (React), `src/renderer/browser`, `src/renderer/floating`, `src/renderer/splash`.
- `src/renderer/api/`: Renderer-main boundary layer. Typed `*Client` classes, event subscriptions, named runtime wrappers. `src/renderer/api/legacy/` is quarantine-only compatibility code (max 3 files).
- `src/shadcn/`: shadcn/ui components shared across renderers.
- `src/shared/`: Shared route contracts (Zod-validated), event contracts, types, and utilities.
- `test/`: Vitest suites (`test/main`, `test/renderer`) with setup files.
- `scripts/`: Build/signing/runtime installers, architecture guards, commit checks.
- Build outputs/assets: `build/`, `resources/`, `out/`, `dist/`.

## Build, Test, and Development Commands
- Install: `pnpm install` + `pnpm run installRuntime` (first time).
- Dev: `pnpm run dev` (HMR). Inspect: `pnpm run dev:inspect`; Linux: `pnpm run dev:linux`.
- Preview: `pnpm start`.
- Type check: `pnpm run typecheck` (or `typecheck:node` / `typecheck:web`). Uses `tsgo` (native TS preview).
- Lint: `pnpm run lint` (runs `agent-cleanup-guard`, `architecture-guard`, then `oxlint`).
- Format: `pnpm run format` (oxfmt). Check: `pnpm run format:check`.
- After completing a feature, always run `pnpm run format` and `pnpm run lint`.
- Test: `pnpm test`, `test:main`, `test:renderer`, `test:coverage`, `test:watch`, `test:ui`.
- Build: `pnpm run build` then `build:win|mac|linux` (add `:x64|:arm64`).

## Turborepo + Vite + Electron Development

For agent-driven development with long-running Vite/Electron processes, follow these patterns:

### Agent Dev Workflow

Never run dev servers in the foreground. Use background processes with log capture:

```bash
# Start the dev command in background, redirect logs
pnpm run dev > /tmp/desktop-dev.log 2>&1 &
echo $! > /tmp/desktop-dev.pid

# Wait for Vite readiness (poll the dev server)
for i in {1..60}; do
  curl -fsS http://127.0.0.1:5173 >/dev/null && break
  sleep 1
done

# Inspect logs (never assume a long-running command is stuck)
tail -n 200 /tmp/desktop-dev.log
```

### Electron Readiness Checks

Two readiness states matter:
1. **Vite renderer ready**: Poll `http://127.0.0.1:5173` (server binds to `0.0.0.0`)
2. **Electron process launched**: Check logs for errors

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
| `@argos/desktop` | `apps/desktop/` | `pnpm run dev` | Main Electron app (Vite 8 + vite-plugin-electron + Rolldown) |
| `@argos/daemon` | `apps/daemon/` | `cd apps/daemon && bun run dev` | Background daemon (Bun) |
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

1. **Route contracts** (`src/shared/contracts/routes/*.routes.ts`): Zod-validated input/output schemas per operation.
2. **Bridge** (`src/shared/contracts/bridge.ts`): `ArgosBridge` interface with `invoke(routeName, input)` and `on(eventName, listener)`.
3. **Preload** (`src/preload/createBridge.ts`): Creates `window.argos` bridge from IPC.
4. **Typed Clients** (`src/renderer/api/*Client.ts`): Domain-specific clients (e.g., `ChatClient`, `ConfigClient`, `SessionClient`) that wrap `bridge.invoke()`.
5. **Runtime wrappers** (`src/renderer/api/runtime.ts`): Named helpers for clipboard, paths, external open — no `window.api` directly.

### Adding a new renderer-main capability

1. Define route in `src/shared/contracts/routes/<domain>.routes.ts`
2. Add to `ARGOS_ROUTE_CATALOG` in `src/shared/contracts/routes.ts`
3. Register route handler in `src/main/routes/`
4. Create or extend `src/renderer/api/<Domain>Client.ts`
5. Use the client from renderer business code

### Legacy quarantine (`src/renderer/api/legacy/`)

- Only allowed place for `useLegacyPresenter()` and `window.electron`/`window.api` access
- Max 3 source files; additions require updating the architecture baseline
- The settings renderer (`src/renderer/settings/`) still imports from here — migration pending
- Business code under `src/renderer/src/` must **never** import from `@api/legacy/`

### Architecture guards

`pnpm run lint` runs two guard scripts before oxlint:
- `scripts/architecture-guard.mjs`: Enforces quarantine bounds, prevents legacy imports in business code, validates bridge register, tracks hot-path edges
- `scripts/agent-cleanup-guard.mjs`: Prevents new code from importing legacy presenter directories or `@shared/chat`

## Coding Style & Naming Conventions
- TypeScript + React 19 + TanStack Router; TanStack Store for state; Tailwind CSS + shadcn/ui for styles.
- Oxfmt: double quotes, semicolons, width 120, trailing commas. Run `pnpm run format`.
- OxLint for JS/TS; hooks run `lint-staged` and `typecheck`.
- Names: React components PascalCase (`ChatInput.tsx`); variables/functions `camelCase`; types/classes `PascalCase`; constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines
- Framework: Vitest (+ jsdom for renderer, node for main) and React Testing Library.
- Two separate configs: `vitest.config.ts` (main, node env) and `vitest.config.renderer.ts` (renderer, jsdom env).
- Location mirrors source under `test/main/**` and `test/renderer/**`.
- Names: `*.test.ts`/`*.test.tsx`/`*.spec.ts`. Coverage: `pnpm run test:coverage`.
- Test aliases match Vite aliases: `@` → renderer src, `@api` → renderer api, `@shared` → shared.

## Path Aliases

| Alias | Main process resolves to | Renderer resolves to |
|-------|-------------------------|---------------------|
| `@/` | `src/main/` | `src/renderer/src/` |
| `@api` | — | `src/renderer/api/` |
| `@shared` | `src/shared/` | `src/shared/` |
| `@shadcn` | — | `src/shadcn/` |

The `@/` alias is context-sensitive: a custom Vite plugin (`pathAliasPlugin`) resolves it to `src/main/` for main-process files and `src/renderer/src/` for renderer files.

## Commit & Pull Request Guidelines
- Conventional commits enforced by hook: `type(scope): subject` ≤ 50 chars; types: `feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release`.
- Do not include AI co-authoring footers in commits.
- PRs: clear description, link issues (`Closes #123`), screenshots/GIFs for UI, pass lint/typecheck/tests. Keep changes focused.
- Default PR base is `dev`; use `gh pr create --base dev` for routine feature, bugfix, docs, test, and refactor branches. Target `main` only for `release/<version>` branches following `docs/release-flow.md`.
- UI changes: include BEFORE/AFTER ASCII layout blocks to communicate structure.

## Architecture Notes & Security
- Patterns: Presenter pattern in main; EventBus for inter-process events; typed route contracts as renderer-main boundary; two-layer LLM provider (Agent Loop + Provider); integrated MCP tools.
- Secrets: use `.env` (see `.env.example`); never commit keys.
- Toolchains: Node 24.14.1, pnpm 10.33.4 (pnpm only). Windows: enable Developer Mode for symlinks.
- Build: Vite 8 with Rolldown; `vite-plugin-electron` multi-env for main/preload/renderer.
- Runtimes: bundled Node, ripgrep, uv, rtk in `runtime/` — installed via `pnpm run installRuntime`.

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
