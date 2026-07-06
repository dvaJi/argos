# Splash — "Argos Sentinel" Radial Activation

## User Need

The splash window (420×340, frameless, shown on every cold start) read as flat and lifeless. The first impression of Argos should feel premium and choreographed — "Lottie-level" motion — while staying on-brand (cyan accent, hairlines, JetBrains Mono, 6px radius cap) and without slowing down the very startup it masks.

## Goal

Redesign the splash renderer from scratch into a single choreographed centerpiece — an **emblem** — built entirely from hand-crafted SVG + CSS (no runtime animation library, so the splash paints instantly and stays 60fps). The sequence:

1. **Aurora** — three soft cyan/teal blobs drift behind everything (`mix-blend-mode: screen` dark / `multiply` light).
2. **Radar pulses** — sonar-style rings emanate from the core on a loop (Argos = the all-seeing sentinel).
3. **Progress ring** — a circular ring fills clockwise from 12 o'clock as activities complete, with a glowing leading tip that tracks the arc end; on completion the ring does a success pulse.
4. **Orbiting sentinel dots** — two dots circle the emblem at different speeds/directions.
5. **Brand mark draw-on** — the `A` strokes reveal in sequence (frame → legs → peak → cyan crossbar).
6. **Core glow** — a breathing radial halo sits behind the mark.
7. **Wordmark** — "Argos" reveals via tracking-expansion + rise.
8. **Status list** — staggered entrance; running rows get a spinning conic-gradient ring, completed rows get a draw-on checkmark, failed rows pulse.

All motion degrades to a static end-state under `prefers-reduced-motion: reduce`.

## Acceptance Criteria

1. The splash renders a single emblem containing the brand mark, a circular progress ring, leading tip, and orbiting dots.
2. The progress ring reflects `completed/total * 100` percent and exposes `data-progress` (0–100) plus `aria-valuenow` on the element with `data-testid="splash-arc"`.
3. At 100% completion the ring gets a success pulse (`splash-ring--done`) and the leading tip is removed.
4. Brand mark strokes animate in via `stroke-dasharray`/`stroke-dashoffset` (pathLength-normalized).
5. Aurora, radar pulses, orbit, and core glow loop continuously while loading; the system-unlock stage shows the emblem in a paused/calm state.
6. Status rows enter staggered; running rows show a spinning ring, completed rows show a draw-on check.
7. Existing IPC/unlock behavior is unchanged: `splash-update`, `DATABASE_UNLOCK_REQUEST/PROGRESS/SUBMIT/CANCEL` channels, password submit/cancel, error/hint text.
8. Existing `data-testid` hooks remain: `splash-stage`, `splash-brand-mark`, `splash-arc`, `splash-status`, `splash-unlock-panel`, `splash-system-unlock`, `splash-unlock`.
9. With `prefers-reduced-motion: reduce`, every animation is disabled and each element shows its static end-state (ring full, mark drawn, rows visible).
10. `pnpm run format` and `pnpm run lint` (architecture + agent-cleanup + oxlint) pass; the splash renderer test passes.
11. No new runtime dependencies. No change to splash window size/frame/transparency in the main process. The last-resort inline HTML fallback in `SplashWindowManager` is untouched.

## Constraints

- Touch only the splash renderer (`Loading.tsx`, `loading.css`) and its test.
- Zero animation libraries — pure SVG + CSS keyframes. Only `transform`, `opacity`, and `stroke-dashoffset` animate (GPU-composited / cheap).
- Keep the calm identity: cyan accent, 1px hairlines, mono wordmark, 6px radius cap on form controls.
- Must fit the 420×340 window without overflow.

## Non-goals

- No Lottie/GSAP/Motion dependency for the splash (bundle-size/latency cost unjustified for a ~1s screen).
- No change to the inline fallback splash, window dimensions, or IPC payloads.
- No particle systems, 3D, or shader effects.

## Open Questions

Resolved: Final direction is the user's explicit brief — a **calm, logo-led** splash ("Logo Fold-In" + "Memory Pulse" + real status), explicitly *avoiding* particles, sparkles, spinners, comet, orbiting dots, fake progress bars and long intros. The real Argos logo (`logo.png` / `logo-dark.png`) is the hero; it materializes via a soft blur-in (true per-segment fold-in is impossible without a vector logo, which the repo does not have — an SVG could be dropped in later). A single cyan "memory pulse" arc travels once around the mark and a center glow breathes behind it; real IPC activity steps stream in below. Implemented in **plain CSS (no animation library)** — GSAP was tried and removed because the motion is simple and a must-not-fail splash is far more reliable in CSS. Splash window resized to 420×280 per brief.
