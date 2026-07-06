# Plan — Splash "Argos Sentinel"

## Approach

A from-scratch rewrite of the splash as one choreographed emblem. All motion is hand-crafted SVG + CSS keyframes — no runtime animation library — so the splash chunk stays tiny and first-paint is instant. React only computes the progress percentage and passes it down; CSS handles every transition/loop.

## Affected Files

- `apps/desktop/src/renderer/splash/loading.css` — full rewrite: tokens, keyframes (stage-in, aurora-a/b/c, pulse, orbit, spin, glow, wordmark, row-in, panel-in, check-draw, ring-done), emblem layers, SVG ring/orbit/mark, status glyphs, unlock panel, reduced-motion guard.
- `apps/desktop/src/renderer/splash/Loading.tsx` — full rewrite: new `Emblem` component (aurora + pulses + glow + SVG with ring/tip/orbit/nested mark), `StatusList` with conditional draw-on check glyph, kinetic wordmark. IPC + unlock logic preserved verbatim.
- `apps/desktop/test/renderer/splash/Loading.test.tsx` — progress assertion migrated from linear width/left to circular ring `data-progress`/`aria-valuenow`; removed the now-dead `argos-mark.svg` mock.
- Untouched: `index.html`, `main.tsx`, main-process `SplashWindowManager.ts` (incl. inline fallback), all IPC contracts.

## Component Model

`Loading` (unchanged state machine: `loading` | `system-unlock` | `unlock`)
 ├─ `Emblem({ progress, paused, done })`
 │   ├─ `.splash-aurora` (3 drifting blobs)
 │   ├─ `.splash-pulse` (3 radar rings)
 │   ├─ `.splash-emblem__glow` (breathing core)
 │   └─ `<svg viewBox=160>` → ring track, ring fill (`pathLength=100`), tip `<g>` (rotated by progress angle), two orbit `<g>`s, nested 24-viewBox mark with draw-on strokes
 ├─ `<h1 class="splash-wordmark">Argos</h1>` (single text node — preserved for tests)
 └─ `StatusList` → rows with `--splash-row-i` stagger; completed rows render a `splash-status__check` SVG

## Progress Math

- `progressPct = completed/total * 100` (0 when no activities).
- Ring: `pathLength=100`, `stroke-dasharray: 100`, `stroke-dashoffset: 100 - pct`. Circle rotated -90° so the dash starts at 12 o'clock and reveals clockwise.
- Tip: `<g>` rotated `(pct/100)*360` degrees around center (80,80) via `transform-box: view-box; transform-origin: 80px 80px`; CSS `transition: transform 520ms` keeps it glued to the arc end.
- On `done`: tip is unmounted, ring gets `splash-ring--done` success pulse.

## Performance

Only `transform`, `opacity`, and `stroke-dashoffset` animate — all GPU-composited or cheap-paint. Aurora uses static `filter: blur` (set once, not animated). No per-frame JS. Loops are CSS `infinite`. Meets the 60fps target on the Electron (Chromium) splash window.

## Reduced Motion

One `@media (prefers-reduced-motion: reduce)` block nulls every animation and forces each element to its end-state: strokes drawn (`stroke-dashoffset: 0`), rows visible, wordmark visible, glow static, pulses hidden, ring/tip transitions removed.

## Test Strategy

- `Loading.test.tsx` covers: shell/mark/wordmark/ring present; 3 status rows with correct modifiers; ring reaches `data-progress=100` at full completion; unlock panel mounts on request; submit sends the IPC payload; dark/light token switching. All 6 pass.
- Manual: `pnpm run dev` cold-start in dark + light, and with OS reduced-motion enabled.

## Compatibility

- All existing `data-testid` preserved; class names are internal and free to change.
- No interface/contract changes; the splash still consumes the same `splash-update` and database-unlock channels.
- The inline HTML fallback splash (used only if the renderer fails to load) is intentionally left as-is.
