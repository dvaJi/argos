# Tasks

- [x] 1. Sweep: re-check delete candidates (still archived, not open) — `useLifecycleSweep.ts`
  Commit `836d0e08`: one fresh `sessions.list` before the delete loop (fail closed on
  fetch error) plus a live `activeSessionId` check per id.
- [x] 2. macOS: keep "Back to chat" on `/archive` and `/usage` — `archive.tsx`, `usage.tsx`
  Commit `0da69a7f`: button renders on macOS with `pl-20` clearing the traffic lights.
- [x] 3. Sidebar: stamp wake time on open — `threadSidebar.ts`
  Commit `273ea7e2`: `markThreadOpened` writes `max(returnedAt, wokeAt ?? now)` and
  persists it before unsnoozing.
- [x] 4. Settings: latch the selected project — `ProjectsSettings.tsx`
  Commit `81c46560`: render-phase latch of `selectedKey` from `projects[0].key`.
- [x] 5. Validate: format, lint, typecheck, UI tests
  `bun run format` (no unrelated churn), `bun run lint` (guards + oxlint deny-warnings),
  `bun run typecheck` (desktop + ui clean), `packages/ui` vitest: 74 passed (7 files).
