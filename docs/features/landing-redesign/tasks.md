# Tasks: Landing page redesign

1. [x] Write SDD folder (spec/plan/tasks)
2. [x] Add `CopyCommand.tsx` shared component
3. [x] Rewrite `Hero.tsx` (tighter copy, command-forward, real screenshot)
4. [x] Add `Agents.tsx` section (`#agents`) and wire into index + nav
5. [x] Rework `Features.tsx` bento with visual diversity (provider icons,
      search chips)
6. [x] Polish `Providers.tsx`, `Spotlight.tsx`, `Download.tsx`, `SiteHeader.tsx`,
      `Footer.tsx`
7. [x] Update `index.tsx` composition and clean `app.css` (drop unused marquee)
8. [x] Validate: typecheck, build, format, lint (all green; SSR smoke-tested)
9. [x] Install `vercel-labs/vgpu` skill via `npx skills add`
10. [x] Validate machine with `vgpu doctor --pretty` (D3D12 healthy)
11. [x] Author `panoptes.wgsl` and iterate headlessly to PNG via `vgpu/node`
12. [x] Add `ShaderBackdrop.tsx` (dynamic import, IntersectionObserver pause,
      prefers-reduced-motion fallback, pointer-reactive fbm aurora)
13. [x] Wire into `Hero.tsx`, re-validate typecheck + build + lint
