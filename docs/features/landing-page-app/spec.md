# Landing Page App (`@argos/landing`)

## User Need

Argos currently has no public marketing website. Users discover the project through the GitHub README, which is dense and developer-facing. A dedicated landing page gives first-time visitors a fast, focused pitch — what Argos is, its key features, and a clear path to download — so the project has a credible public front door that can be deployed to Cloudflare Workers.

## Goal

Add a new monorepo app `apps/landing` (`@argos/landing`) that renders a single-page marketing site for Argos, built with TanStack Start (React 19 + TanStack Router + SSR) and deployed to Cloudflare Workers via `@cloudflare/vite-plugin`.

The landing page communicates Argos's value: open-source AI agent platform, multi-LLM chat, MCP tools, Skills, ACP integration, remote control, and cross-platform desktop apps. It links to GitHub Releases and the in-app download flow.

## Acceptance Criteria

1. `apps/landing` is a valid pnpm workspace package (`@argos/landing`) that the root `pnpm-workspace.yaml` already covers via `apps/*`.
2. `pnpm --filter @argos/landing dev` starts the Vite dev server and serves the landing page at `http://localhost:3000`.
3. `pnpm --filter @argos/landing build` produces a `.output/` directory with a server entry and static assets (Cloudflare Workers compatible output).
4. The app uses TanStack Start with file-based routing (`src/routes/`), a `getRouter()` factory in `src/router.tsx`, and an SSR shell via `createRootRoute({ shellComponent })`.
5. `wrangler.jsonc` is configured with `nodejs_compat`, the TanStack Start server entrypoint, and observability — matching the Cloudflare Workers TanStack Start guide.
6. The landing page renders: hero (brand, tagline, primary CTAs), features grid, providers highlight, download section (Windows/macOS/Linux + Homebrew), and a footer with links.
7. Styling uses Tailwind CSS v4 via `@tailwindcss/vite`, consistent with the Argos cyan-accent identity.
8. `pnpm --filter @argos/landing typecheck` passes with zero errors.
9. The app does not break the root `pnpm run lint` / architecture guard / agent-cleanup guard.

## Constraints

- New app lives entirely under `apps/landing/`; no changes to the desktop or daemon apps.
- No dependency on Electron, native modules, or the bundled runtime.
- Use versions from the root pnpm catalog where a catalog entry exists (react, react-dom, vite, @vitejs/plugin-react, tailwindcss, @tanstack/react-router, typescript).
- `@tanstack/react-start`, `@cloudflare/vite-plugin`, and `wrangler` are landing-only deps (not added to the catalog).
- Must stay within the Turbo task graph: define `build`, `dev`, `typecheck` in `apps/landing/turbo.json`.

## Non-goals

- No CMS, analytics, or A/B testing.
- Static English copy in the first increment, matching the splash precedent.
- No backend/server functions beyond static SSR — the page is fully static content.
- No redirect from the desktop app to the landing page in this increment.
- No custom domain configuration or CI/CD pipeline setup (deployment is a manual `wrangler deploy` step documented in the README).

## Open Questions

Resolved:
- **Framework choice**: TanStack Start per the request and the Cloudflare guide; it shares the repo's React 19 + TanStack Router stack, so the toolchain is familiar.
- **Deploy target**: Cloudflare Workers with `@cloudflare/vite-plugin` (zero-config output), not Pages.
- **Styling**: Tailwind v4 (`@tailwindcss/vite`) to match the repo's design tokens and avoid a parallel CSS-in-JS pipeline.
