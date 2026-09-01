# Issue: Argos agent litters arbitrary directories with scratch scripts

## Summary

When a chat session has no attached project (and no default project path), the Pi
worker's working directory fell back to `process.cwd()` — the daemon's launch
directory (repo root in dev, program/home directories in production). The agent
treats its cwd as its workspace and writes one-off scripts, notes, and temp files
there, polluting directories shared with other apps or the user.

## Root cause

`buildInit` in `pi-provider-execution.ts`:

```ts
const cwd = session.projectDir || agent?.defaultProjectPath || process.cwd();
```

## Fix

- Daemon bootstrap creates/ensures `<dataDir>/agent-workspace` (added to
  `ensureDirectories` in lifecycle.ts) — a private, Argos-owned, writable
  directory not shared with other applications.
- `PiProviderExecutionPort` receives `agentWorkspaceDir` and uses it as the cwd
  fallback instead of `process.cwd()`; the directory is created on demand.
- The scratch workspace is treated as trusted (Argos created it), so the agent
  is not nagged for trust confirmation in its own private directory.
- The worker `systemPrompt` gains a workspace instruction when the fallback is
  active: scripts/temp files belong in this directory; never write outside it
  unless the user gives an explicit absolute path.
- Sessions with a real `projectDir` (or a configured default project path) are
  unaffected.

## Acceptance criteria

- New chat with no project: agent's cwd is `<dataDir>/agent-workspace`, the dir
  exists, and the agent's system prompt contains the workspace instruction.
- Sessions with a project dir keep using it.
- The daemon cwd is never used as an agent workspace.
