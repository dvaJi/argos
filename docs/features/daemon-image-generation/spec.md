# Spec: daemon image generation

## Problem

Argos agents have an **Image generation** model setting (`ArgosAgentConfig.imageGenerationModel`),
but only the legacy desktop tool (`apps/desktop/.../agentImageGenerationTool.ts`) reads it. Agent
turns now run in the daemon (Pi), so asking an agent to "draw a cat" never reaches an image model.

## User stories

- As a user, after picking an image generation model for an Argos agent, I can ask the agent to
  create an image and see the result inline in the conversation.
- As a user, I can open/save the generated image like other tool-result images.
- As an agent, I receive a short text summary (model, settings, saved file path) — not raw image
  bytes — so the conversation context stays small and I can reference the saved file.

## Acceptance criteria

1. When an agent has `imageGenerationModel` set, its Pi sessions expose an `image_generate` tool
   (same name/server as the legacy tool: `@argos/shared/agentImageGenerationTool`). Agents without
   it do not see the tool. The tool survives `enabledMcpServerIds` allowlists (like memory tools).
2. The tool validates the configured model is an image-generation model; otherwise it returns an
   `IMAGE_GENERATION_MODEL_UNAVAILABLE` error result instead of throwing. Eligibility uses the same
   shared inference as the UI pickers (`resolveImageGenerationCompatType`): listed `type`, image
   endpoint hints, or untyped `dall-e-*` / `gpt-image-*` ids (OpenAI's `/models` has no types) —
   plus model config `type`/`apiEndpoint`/`endpointType`.
3. Generation uses AI SDK `generateImage` with backend-core's provider context (`imageModel`),
   honoring `size`, `quality`, `outputFormat`, `background`, `moderation` the same way the desktop
   runtime does. Requests time out after 2 minutes.
4. Images are written to `<dataDir>/images/generated/<uuid>.<ext>`; the tool result carries
   `imagePreviews` with `imgcache://generated/<uuid>.<ext>` and the tool-call block in the
   conversation shows them via the existing `MessageBlockToolCallImagePreview`.
5. No base64 image data is stored in tool-call `response` text or sent back to the model.
6. Desktop renders `imgcache://` via Electron's existing protocol (same `<userData>/images` dir —
   the desktop passes `userData` as the daemon `--data-dir`). Web mode renders it through an
   authenticated daemon route `GET /api/v1/imgcache/<path>` (traversal-safe, images dir only).
7. Remote-control delivery keeps working: it already promotes `tool_call.imagePreviews` and
   resolves `imgcache://` against `<dataDir>/images`.

## Verified facts

- OpenRouter image models (e.g. `recraft/recraft-v4.1-flash-v2:free`) accept
  `POST /api/v1/images/generations` with `response_format: "b64_json"` and return
  `{ data: [{ b64_json, media_type: "image/webp" }] }` — OpenAI-compatible, so the AI SDK
  openai-compatible `imageModel` path applies (tested 2026-11-16 against a $0 model).
- The AI SDK openai-compatible image model posts `{model, prompt, n, size, ...providerOptions}`
  to `{baseUrl}/images/generations` (no `response_format`) and accepts either `b64_json` or `url`
  entries (URLs are downloaded). Verified against a local mock returning OpenRouter's exact shape.
- `/api/v1/*` auth: loopback is trusted; browser sessions authenticate with the `argos_session`
  cookie, which same-origin `<img>` requests send. The image route sits after `authorize()`.
- Pi uses the same `toolCall.id` for `tool_execution_start` and `execute`, so previews attached in
  the daemon's `mcpRequest` handler land on the block created at `toolStart`.
- Pi worker signatures include tool names, so adding/removing the tool restarts the worker.

## Known limitations

- STOP does not cancel an in-flight generation (no abort crosses the tool-call port); it is bounded
  by the 2-minute timeout and the image is still saved.
- Web mode remaps only the preview `src`; save/copy actions on `imgcache://` previews may not work
  in the browser.
- A desktop shell attached to a remote daemon resolves `imgcache://` locally, so remotely generated
  images will not render there.

## Non-goals

- Image editing / image inputs, video or TTS generation.
- Writing generated images into the user's project directory (the agent gets the path and can
  copy it when asked).
- Removing the legacy desktop tool.

## Open questions

None.
