# Plan: daemon image generation

## Components

- `apps/daemon/src/host/daemonImageGenerationRuntime.ts` (new)
  - `toolDefinitions()` → one `image_generate` `MCPToolDefinition` (zod schema mirrored from the
    legacy tool; server `builtin-image-generation`).
  - `handlesTool(name)`.
  - `callTool(request, agentId)` → resolve `imageGenerationModel`, validate it is an image model,
    `generateImage({ model: context.imageModel, prompt, size?, providerOptions?, abortSignal })`,
    write files, return `MCPToolResponse { content: <JSON summary>, imagePreviews, isError }`.
  - Pure helpers exported for tests: option → request mapping, extension from media type,
    model eligibility.
- `apps/daemon/src/index.ts`: append definitions in `listTools` when the agent has an image model
  (after the MCP allowlist filter); route `callTool`; add `GET /api/v1/imgcache/*` after `authorize()`.
- `apps/daemon/src/host/pi-provider-execution.ts`: in the `mcpRequest` handler, copy
  `response.imagePreviews` onto the matching in-flight `tool_call` block (the block exists from
  `toolStart`; `toolEnd` spreads `tool_call`, keeping the previews). Not relying on Pi forwarding
  `details` through `tool_execution_end`.
- `packages/ui/src/components/message/MessageBlockToolCallImagePreview.tsx`: when there is no
  Electron bridge (`window.electron`), map `imgcache://<p>` → `/api/v1/imgcache/<p>`.

## Data / compatibility

- No schema changes. Files live under the existing `<dataDir>/images` cache root shared with the
  desktop `imgcache` protocol and remote-control runner.
- The legacy desktop tool is untouched; the daemon tool shares its name and output envelope
  (`createAgentToolSuccessResult` / `createAgentToolErrorResult`).

## Tests

- Unit: request option mapping, media type → extension, model eligibility, tool exposure gating,
  error results (no model / wrong type / provider failure), file write + preview shape (with an
  injected `generateImage`).
- Unit: imgcache path resolution rejects traversal.
- Manual: OpenRouter free image model end-to-end in the desktop app.
