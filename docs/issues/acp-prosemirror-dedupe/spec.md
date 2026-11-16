# Duplicate prosemirror-model breaks chat send

## Problem

Sending a chat message crashes the renderer with:

```
Uncaught RangeError: Can not convert <> to a Fragment
(looks like multiple versions of prosemirror-model were loaded)
```

Vite also warned at dev start: `[tiptap warn]: prosemirror-model is loaded more than once`.

Root cause (bun isolated store, `bun.lock`): `prosemirror-commands@1.7.2` carried a **nested**
`prosemirror-model@1.25.11` while the rest of the graph (including `@tiptap/pm@3.33.1`, which the
composer uses) resolved `1.25.13`. Two copies → cross-copy `instanceof`/prototype checks fail
when the composer converts editor content to a Fragment.

Pre-existing on `master`; unrelated to the registry work in `feat/acp-command-code` (reported
while testing that branch).

## Fix

Root `package.json` bun override: `"prosemirror-model": "1.25.13"` — collapses every nested
resolution to a single version (overrides are already the house pattern: `node-abi`, `rolldown`).
`bun.lock` now contains exactly one `prosemirror-model` resolution; the stale `1.25.11` store
entry is an unreferenced orphan. Stale Vite dep caches (`node_modules/.vite`) were cleared so the
dev bundle re-optimizes on next start.

## Acceptance

- `bun.lock` resolves a single `prosemirror-model` version.
- Chat send no longer throws the RangeError (manual verification on `bun run dev`).

## Non-Goals

- Vite `resolve.dedupe` (redundant once the graph has one version).
- Store GC (`bun pm cache rm`) — cosmetic; orphaned store dirs are unreferenced.
