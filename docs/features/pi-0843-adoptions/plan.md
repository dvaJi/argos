# Plan: pi 0.84.2/0.84.3 adoptions

## A. Compaction failure surfacing

1. `apps/daemon/src/host/piWorkerProtocol.ts` — compaction union member:
   `phase: "start" | "end" | "failed"`, add `aborted?: boolean; willRetry?: boolean`.
2. `apps/daemon/src/host/piWorker.ts` — `compaction_end` case: derive
   `failed = Boolean(errorMessage) || aborted`; emit the derived phase + flags.
3. `apps/daemon/src/host/pi-provider-execution.ts` — handle `event.type === "compaction"`:
   `failed` + `!aborted && !willRetry` → `await this.markError(sessionId)` (existing helper);
   log the failure with reason/retry state. Other phases: no-op.

## B. Windows PowerShell tool

1. `piWorkerProtocol.ts` — `PiWorkerInit.enablePowershellTool?: boolean`.
2. `piWorker.ts` — when `enablePowershellTool && process.platform === "win32"`, pass
   `tools: ["read", "bash", "edit", "write", "powershell"]` to `createAgentSession`; else omit.
3. `pi-provider-execution.ts` `buildInit` —
   `enablePowershellTool: process.platform === "win32" && getSetting("pi_enable_powershell_tool") === true`;
   include in the worker signature.
4. Config plumbing (thread_sidebar_enabled pattern): `config.routes.ts`
   (keys/values/change union), `configRouteSupport.ts` (desktop + backend-core) read support.
5. `ArgosAgentsSettings.tsx` — "Windows PowerShell tool" switch (config client get/set, live sync
   via entries-changed), placed as a runtime-tools section.

## C. SamplingParams hint

`ModelConfigDialog.tsx` — hint under the JSON textarea: forwarded verbatim by the Pi runtime;
vLLM users can set `thinking_token_budget`.

## Verification

- `bun run typecheck` (desktop + daemon + ui), daemon `bun test`, lint, format.
- Manual (Windows): enable the toggle → pi session exposes `powershell`; trigger threshold
  compaction failure (tiny context) → session status flips to error; `/compact` failure toasts.
