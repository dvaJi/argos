# Tasks: daemon image generation

- [x] Runtime: `DaemonImageGenerationRuntime` + helpers + unit tests.
- [x] Wire `listTools` / `callTool` in `index.ts`.
- [x] Attach `imagePreviews` to tool-call blocks in `pi-provider-execution.ts`.
- [x] `GET /api/v1/imgcache/*` route (after auth) + traversal test.
- [x] UI: web-mode `imgcache://` → daemon route in tool-call image previews.
- [x] Validate: typecheck (daemon/ui/desktop), daemon + ui tests, format, lint.
- [x] Verify the generator through backend-core's provider context against a local mock with
      OpenRouter's response shape (live OpenRouter call verified separately with curl).
- [ ] Manual: desktop + web render the preview.
