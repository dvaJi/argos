# React scroll area update loop

## User need

Settings pages must render and refresh without crashing with `Maximum update depth exceeded`.

## Goal

Remove the callback-ref state cycle created by the shared Radix scroll-area root under the current React runtime.

## Acceptance criteria

- A mounted scroll area can rerender after an asynchronous state update without throwing or looping.
- Existing `ScrollArea` call sites keep their class, style, event, and child behavior.
- Settings overview and Argos agent settings can complete their initial asynchronous loads.

## Constraints

- Keep the shared component API stable for existing call sites.
- Preserve native keyboard, pointer, and wheel scrolling.
- Avoid a dependency patch that would be overwritten on install.

## Non-goals

- Redesigning settings layouts.
- Changing the Argos agent form synchronization behavior.

## Open questions

None.
