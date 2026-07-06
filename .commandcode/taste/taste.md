# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/


# Architecture
- The Vite root for the renderer is `apps/desktop/src/renderer/` (see `vite.config.ts` line 121). Shared React components like `agent-elements/` live at `apps/desktop/src/components/agent-elements/` — sibling to `renderer/`, NOT under `src/renderer/src/`. Relative imports from `src/renderer/splash/` or `src/renderer/src/assets/` to these shared components need `../../../components/...` (three `..`s), not `../../components/...`. The splash `loading.css` comment about "agent-ui.css not being importable across directories" is outdated/misleading — the path was just wrong, not impossible. Confidence: 0.80
- Prefer migrating to and removing legacy code over maintaining it. When given the choice between keeping an unused/dead prop (e.g. an `onNavigate?()` callback that's never wired) and deleting it along with its call sites, delete it. The user's stated stance: "we should just migrate everything and get rid of legacy stuff." Confidence: 0.70

# Testing
- Add a `vite-env.d.ts` (or extend `src/main/env.d.ts`) with `declare module '*?raw' { const content: string; export default content; }` before importing `*.svg?raw` / `*.json?raw` / etc. in test files — the project has no ambient declaration for Vite's `?raw` suffix, so TypeScript fails with TS2307 even though vitest runs fine. Confidence: 0.90

# Design
- Target a Linear/Vercel-class UX bar: sharp/geometric visual identity, high contrast, hairline borders (1px/2px), minimal radii (cap at 6px, not 0.75rem shadcn default), monospace data text, single sharp accent color, no decorative shadows/gradients. Match the precision and density of those products, not generic SaaS templates. Confidence: 0.85
- Use a single electric cyan-blue accent (`hsl(199 89% 48–56%)`, Vercel/Linear "verified cyan" family) on a near-black surface (`hsl(225 30% 6%)` ≈ `#0B0E14`) for the brand. Reserved for focus/active states and the brand mark crossbar; the rest of the UI is monochrome ink at varying opacities. Confidence: 0.75
- When authoring in-house SVG icons that will live alongside `@hugeicons` (or replace it), use `viewBox="0 0 N N"` (N = 16 or 24), `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`. No `box-shadow`, no gradient, no filled shapes (exception: a single accent-color line on the brand mark). Decorative icons get `aria-hidden="true"`. Confidence: 0.75
- The splash window is its own surface — it does NOT inherit the main app's theme store. Use dedicated `--splash-*` tokens in `loading.css` and switch via `@media (prefers-color-scheme: light)`. The main process `backgroundColor` field, `loading.css` body bg, and `buildInlineFallbackSplashUrl()` inline styles must all match (both dark and light branches) in a single commit to preserve the no-flash guarantee. Confidence: 0.75
- For Linear-class splash design, keep the splash ultra-minimal: brand mark + wordmark + 1px hairline progress arc + 3-line status list. No border frame around the window, no background grid, no top scanline, no corner watermark. The arc is the only animated element when idle; the status list is the source of truth (rows never cross-fade, just change color). Confidence: 0.70

# Lint Workflow
- Before mass-applying any regex/transform script to fix lint warnings, run `pnpm run typecheck` and record the baseline error count; after the script, re-run typecheck and confirm the count is unchanged (or only pre-existing TS2589 errors decreased). The user has been burned twice by over-broad transforms that silently broke `this.method` bindings, void-returning callbacks, and `unknown[]` typing — they explicitly called out "you did it bad at start" when a script introduced hundreds of new TypeScript errors. Confidence: 0.85
- When using `oxlint`, use `-f stylish` (or default) to get the rule name in the output (it appears at end of each line as `plugin(rule-name)`). The `-f json` output strips rule names, which makes rule-by-rule counting much harder. Confidence: 0.70
- This project uses `pnpm run typecheck` (which runs `tsgo --noEmit -p tsconfig.node.json --composite false` and `tsconfig.web.json`) and `pnpm run lint` (`oxlint .`). Always run both before claiming a change is clean. Confidence: 0.75
