# ACP diagnostics performance

## Part 1 — Identify the slowdown

The supplied React Scan interaction reports 1 ms in React rendering and 255.4 ms outside React. The UI package enables React Compiler, so manual component memoization is not indicated.

The current ACP diagnostics action performs daemon route/IPC work and may cold-start an external ACP process before initialization. This is the leading hypothesis for the non-React time.

## Part 2 — Fix the slowdown

Keep the diagnostic UI responsive while the external process starts and avoid repeated cold starts for the same enabled agent and workspace. Do not pre-spawn agents merely by rendering the Settings page.

The daemon client used by diagnostics must retain a stable identity across renders. Recreating it during render retriggers the data-refresh effect and causes an infinite render/request loop.

## Acceptance criteria

- No speculative React memoization is introduced.
- The diagnostic action exposes progress while non-React work runs.
- Repeated runs against the same agent and workspace reuse the existing warmup process where available.
- A follow-up React Scan trace can be matched to the same “Run Diagnostics” interaction before claiming an end-to-end timing improvement.

## Non-goals

- Do not modify node_modules or replace the ACP SDK without a trace proving it is the bottleneck.
