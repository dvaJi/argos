# Tasks — Thread Sidebar v3

1. [x] Spec/plan/tasks; archive `thread-sidebar-polish` and `thread-sidebar-fixes`.
2. [x] Rewrite `stores/ui/threadSidebarState.ts` (storage migrations, transition diff, prune) + tests.
3. [x] Rewrite `components/threads/threadSidebarLogic.ts` (lifecycle, partition, sorts, statuses, presets, labels,
       next-thread) + tests.
4. [x] Rewrite `stores/ui/threadSidebar.ts` (store, actions, effective-settled hook, sync).
5. [x] Rewrite `ThreadSection`, `ThreadSidebarRow`, `ThreadSidebarList`.
6. [x] Update `SettledBanner`, `AgentSwitcher`, `ChatPage`, `NewThreadPage`, `WindowSideBar` call sites.
7. [x] `bun run format`, `bun run lint`, `bun run typecheck`, vitest.
