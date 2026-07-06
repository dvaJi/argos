# Tasks

- [x] Scaffold `apps/landing/` package: `package.json` (`@argos/landing`), `tsconfig.json`, `turbo.json`, `.gitignore`, `README.md`.
- [x] Add configs: `vite.config.ts` (cloudflare + tanstackStart + react + tailwindcss), `wrangler.jsonc`, `tsr.config.json`.
- [x] Create `src/router.tsx` (`getRouter`) + `src/routeTree.gen.ts` placeholder.
- [x] Create `src/routes/__root.tsx` (root route with `head()` meta/links, `shellComponent`, global CSS).
- [x] Create `src/styles/app.css` (Tailwind v4 + Argos cyan-accent tokens).
- [x] Build landing components: `SiteHeader`, `Hero`, `Features`, `Providers`, `Download`, `Footer`.
- [x] Compose the page in `src/routes/index.tsx`.
- [x] Install deps (`pnpm install`) — added `workerd` to `allowBuilds` in `pnpm-workspace.yaml`.
- [x] `pnpm --filter @argos/landing typecheck` passes (0 errors).
- [x] `pnpm --filter @argos/landing build` emits Workers-compatible `dist/server/index.js` + `dist/client/`.
- [x] Verified SSR output at dev server (all sections render: header, hero, features, providers, download, footer).
- [x] Root `pnpm run lint` passes — agent-cleanup guard, architecture guard, and oxlint all clean (0 warnings/errors).
- [x] `oxfmt` formatting applied.
