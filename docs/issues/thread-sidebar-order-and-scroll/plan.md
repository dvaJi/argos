# Implementation plan

Render the thread sections and derive keyboard order from the same section sequence. Let the sidebar session column and its scroll containers shrink within the available window height. Review lifecycle settings from Display Settings through classification and verify the timing with focused tests.

Cover the order with a jsdom render test (`ThreadSidebarList.test.tsx`): seed threads in every section, then assert the DOM order of sections and rows, the `onVisibleRowsChange` sequence, badge numbering and ArrowDown selection. Sync `docs/features/thread-sidebar-v3` (D1, AC1, AC3, AC7) and the stale code comments with the result.
