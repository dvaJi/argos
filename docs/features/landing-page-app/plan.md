# Plan — Landing Page App (`@argos/landing`)

## Approach

Create a self-contained TanStack Start app under `apps/landing/` following the Cloudflare Workers deployment guide. The app renders one SSR page (`/`) with marketing copy for Argos. All content is static; no server functions or bindings in the first increment. The build produces a Workers-compatible `.output/` via `@cloudflare/vite-plugin`.

## Affected Files (all new)

- `apps/landing/package.json` — `@argos/landing`, scripts (`dev`, `build`, `preview`, `deploy`, `cf-typegen`, `typecheck`), deps from catalog + landing-only deps.
- `apps/landing/turbo.json` — extends root; defines `build`/`dev`/`typecheck` outputs.
- `apps/landing/tsconfig.json` — bundler resolution, `~/*` path alias → `src/`, JSX react-jsx.
- `apps/landing/vite.config.ts` — `cloudflare({ viteEnvironment: { name: "ssr" } })`, `tanstackStart()`, `react()`, `tailwindcss()`.
- `apps/landing/wrangler.jsonc` — name, `nodejs_compat`, `main: "@tanstack/react-start/server-entry"`, observability, `assets`/`compatibility_date`.
- `apps/landing/tsr.config.json` — TanStack Router codegen options (`autoCodeSplitting`, src dir).
- `apps/landing/src/router.tsx` — `getRouter()` returning `createRouter({ routeTree, ... })`.
- `apps/landing/src/routeTree.gen.ts` — generated placeholder (regenerated on dev/build); imports root + index.
- `apps/landing/src/routes/__root.tsx` — `createRootRoute` with `head()` (meta/links), `shellComponent: RootDocument`, global CSS import.
- `apps/landing/src/routes/index.tsx` — landing page composition (hero, features, providers, download, footer).
- `apps/landing/src/styles/app.css` — Tailwind v4 `@import "tailwindcss"` + Argos theme tokens (cyan accent, dark backdrop).
- `apps/landing/src/components/*` — section components (`Hero.tsx`, `Features.tsx`, `Providers.tsx`, `Download.tsx`, `Footer.tsx`, `SiteHeader.tsx`).
- `apps/landing/.gitignore` — `.output/`, `node_modules`, `.wrangler/`.
- `apps/landing/README.md` — how to run/deploy.

No existing files change. `pnpm-workspace.yaml` already includes `apps/*`, so the new app is discovered automatically once its `package.json` exists.

## Architecture

```
Cloudflare Worker (wrangler.jsonc → @tanstack/react-start/server-entry)
  └─ Nitro/SSR runtime (tanstackStart plugin)
      └─ Vite SSR environment (cloudflare vite plugin)
          └─ React 19 + TanStack Router (getRouter)
              └─ routes/__root.tsx (shell + head)
                  └─ routes/index.tsx (landing page)
```

- **Server entry**: `@tanstack/react-start/server-entry` (default, no custom handler needed — no queues/crons/bindings yet).
- **Routing**: file-based, `src/routes/`, code-split automatically via `tsr.config.json`.
- **SSR shell**: `shellComponent` in the root route renders `<html><head/><body>…<Scripts/></body></html>` so the page is fully server-rendered then hydrated.
- **Static assets**: `public/` served from `.output/public` on Workers.

## Data Flow

None in the first increment. The page is static content. A future increment can add `createServerFn` loaders for release metadata or changelog, and Cloudflare bindings (R2, KV) — out of scope here.

## Compatibility

- Fully additive: no surface touched outside `apps/landing/`.
- Root `turbo.json` task graph unchanged (the new app declares its own outputs).
- Root lint/architecture guards are scoped to `src/main`, `src/renderer`, `packages/`, and legacy quarantine — the landing app lives under `apps/landing` and does not import from those paths, so guards are unaffected.
- The landing app pins React 19 + TanStack Router from the catalog, so versions stay in lockstep with the desktop app.

## Test Strategy

- **Type check**: `pnpm --filter @argos/landing typecheck` (tsgo/tsc noEmit) must pass.
- **Build**: `pnpm --filter @argos/landing build` must emit `.output/server/index.mjs` + `.output/public`.
- **Manual**: `pnpm --filter @argos/landing dev` → visit `http://localhost:3000`, verify hero/features/download/footer render and links resolve.
- No unit tests in the first increment (pure presentational static content); add Vitest if interactive logic or data loaders land later.
