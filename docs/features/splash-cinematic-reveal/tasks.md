# Tasks

- [x] Remove `gsap` + `@gsap/react` (tried, then dropped — plain CSS is more reliable for a must-not-fail splash and the motion is simple).
- [x] Rewrite `Loading.tsx`: calm logo-led emblem — real `logo.png`/`logo-dark.png` with soft blur-in, one cyan "memory pulse" arc traveling around the mark, center glow. Real status stack (IPC activities) with calm dots; "Starting Argos…" placeholder before first update. No sparkles/comet/burst/orbit/spinner.
- [x] Rewrite `loading.css`: minimal calm keyframes (stage-in, logo-in, pulse-travel, glow, wordmark, row-in, dot, panel-in) + reduced-motion guard that settles everything instantly.
- [x] Improve the pulse: memory-pulse arc now loops slowly (2.6s, linear) instead of one-shot, and the logo gently breathes (scale) after reveal.
- [x] Status text uses the real `TextShimmer` component (`src/components/agent-elements/text-shimmer.tsx`) — loaded `agent-ui.css` in the splash and drove its `--an-foreground-*` tokens with splash colors (dim → cyan sweep) on in-flight rows (placeholder + running). Done/failed rows stay static.
- [x] Update `Loading.test.tsx`: drop the removed `splash-arc` assertions; add a placeholder-state test; repurpose the completion test to assert all status rows become `--done` (7 tests, all green).
- [x] Resize splash window 420×340 → 420×280 (main process, per brief).
- [x] Run `oxfmt`, `oxlint` (0 warnings/errors), architecture guard (passed), agent-cleanup guard (passed), `typecheck:web` (splash: 0 errors; only pre-existing unrelated baseline errors remain).
- [ ] Manual: visually verify dark/light + reduced-motion on `pnpm run dev` cold start (needs human eyes).
- [x] i18n: N/A — no `i18n` script exists in the current tree; splash uses static English strings and zero locale keys were touched.
