# Plan: computer-use-slash-command

## Approach

1. `useChatInputMentions.ts`:
   - module-scope `cuaPluginClient = createPluginClient()`;
   - `cuaStatus` state (`PluginListItem | null`) refreshed per session;
   - `/computer-use` item added to `slashItems` with status-aware description;
   - `handleSlashSelection` intercepts the item by id and inserts the composed guidance
     text via `editor.insertContentAt`.
2. Guidance text lives in a small pure builder (`buildComputerUseGuidance`) fed by
   `{ enabled, runtimeState, runtimeError }` so it is easy to test and extend.

## Test strategy

- Typecheck + lint; manual verification through the composer (menu entry, inserted text
  per status).
