# Command Code as ACP Agent — Implementation Plan

## Approach

`AcpRegistryService` replaces the manifest wholesale on every source load (bundled seed → cache →
upstream refresh in `fetchAndCache`), so a seed-only entry would be lost on refresh. Instead,
introduce a **curated overlay** applied at every manifest assignment point:

```
manifest source (seed | cache | upstream) → mergeCuratedAgents() → this.manifest
```

- Upstream/seed entries keep priority: curated records whose `id` already exists are skipped.
- Curated records are raw JSON records (same schema as the bundled seed) normalized through the
  service's existing `normalizeAgent`, so malformed entries are dropped, never crash.

## Affected Interfaces

| Thing | Kind | Change |
| --- | --- | --- |
| `packages/acp-runtime/src/config/acpCuratedAgents.ts` | new | `ACP_CURATED_AGENT_RECORDS` (Command Code, unpinned `npx command-code acp`) |
| `packages/acp-runtime/src/config/acpRegistryService.ts` | change | `applyManifest()` / `mergeCuratedAgents()`; all manifest assignments routed through the merge |
| `apps/desktop/test/main/presenter/configPresenter/acpRegistryService.test.ts` | change | curated merge + upstream-wins tests |
| `docs/features/acp-command-code-agent/*` | new | this SDD |

No route, event, presenter, or renderer changes — the UI already lists registry agents generically
(`config.getAcpAgents` → agent picker).

## Data Flow

1. Service loads a manifest from any source.
2. `applyManifest` merges curated records (normalized; id-conflict → source wins).
3. `listAgents()` / `getAgent()` expose the merged list; enable/install flows are unchanged
   (`npx` distribution needs no install step).

## Test Strategy

Extend the desktop Vitest suite (temp `app-root` + `user-data` harness, stubbed `fetch`):

- Built-in seed without Command Code → `listAgents()` includes `command-code`.
- `refresh(true)` against an upstream manifest without Command Code → still listed.
- Upstream manifest containing its own `command-code` (different version) → upstream version wins,
  exactly one entry.

## Compatibility

- Additive; no schema/type changes. Existing cached snapshots (userData) keep working; curated
  agents appear immediately on next daemon start regardless of cache state.
- When upstream adopts Command Code, the official entry supersedes the curated copy with no code
  change (delete the curated record later as cleanup).
