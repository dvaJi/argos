# Plan

1. Allow the persistence callback to receive an explicit configuration snapshot.
2. Build each immediate mutation once, update local state with it, and persist the same value.
3. Add a renderer test that clicks **New Hook** and verifies both the rendered hook and persisted payload.
4. Run the focused renderer test, UI typecheck, React Doctor, formatting, and linting.
