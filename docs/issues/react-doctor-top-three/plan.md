# React Doctor Top Three — Plan

1. Follow React Doctor's direct-import recipe for the two desktop presenter barrels.
2. Verify hook-rule false positives: expose plain legacy presenter getters for non-render callers, use the sidepanel store directly in non-React artifact helpers, and keep `useStartupWorkloadStore` unconditional in the component.
3. Move side effects out of selected updater callbacks while retaining their ordering in the caller.
4. Run focused tests, type checks, format, lint, and a full React Doctor scan; stop before the remaining migration-scale updater fixes.
5. Call `useMessageCapture` directly and move Vertex provider field synchronization from `useMemo` to `useEffect`.
6. Apply the effect-cleanup recipe to each verified timer: retain its handle and cancel it from the effect teardown.
7. Apply the accessibility recipe to the seven reported images with contextual descriptive `alt` text.
8. Triage ref reads in render against the canonical recipe and fix only local, safe occurrences.
