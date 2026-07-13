# React Doctor Top Three — Issue Spec

## User need

Resolve this pass's two bounded React Doctor findings and validate the recommended state-updater pattern on a representative sample, without sweeping migration-scale findings.

## Goal

- Replace the two presenter barrel imports with direct module imports.
- Remove all seven `rules-of-hooks` findings by using non-hook accessors outside React renders and calling the real hook unconditionally inside `ChatTabView`.
- Apply and validate the pure-state-updater pattern in the representative files named by the report.
- Fix the next two bounded React Compiler errors: the disguised `useMessageCapture` call and Vertex provider state synchronization during render.
- Release the four effect-owned timers that React Doctor identified, so unmounting or re-running an effect cannot run stale UI work.
- Give every reported image an accessible text alternative, using the filename where it conveys user content and a product-logo description where it does not.
- Resolve locally safe ref reads during render without altering event-driven ref usage.

## Acceptance criteria

- The affected React Doctor findings no longer appear in a full verbose scan.
- State updater callbacks touched in this pass only calculate and return next state; related UI effects run from the event path instead.
- Type checks, formatting, lint, and focused tests pass.

## Constraints

- Do not suppress diagnostics.
- Do not modify the remaining migration-scale updater sites this pass; request code-owner sign-off before a broader sweep.
- Preserve the user's unrelated worktree changes.

## Non-goals

- The other React Doctor rule categories and remaining updater sites.
