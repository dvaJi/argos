# Plan: react-scan-dev-crash

## Approach

1. `packages/ui/index.html` — delete the static react-scan script tag.
2. `packages/ui/vite.config.ts` — drop the now-dead `strip-react-scan` build plugin;
   add a `apply: "serve"` plugin that injects the (unpinned, unchanged) react-scan tag
   only when `VITE_REACT_SCAN === "1"`.
3. `.env.example` — document `VITE_REACT_SCAN=1` (commented out).

## Test strategy

- Headless capture of the dev server: default load shows no react-scan banner; with the
  flag the banner returns.
- `bun run lint` + format.
