# Command Code as ACP Agent

## User Need

The user wants Command Code (https://commandcode.ai/docs/acp) available as an ACP agent inside
Argos — i.e. listed alongside Claude Agent, Codex, Gemini, etc. in the ACP agent picker, so its
CLI (`cmd acp`; binary `cmd` / `cmdc` / `command-code`) can be hosted by Argos like any other
external ACP agent.

Command Code is **not** present in the official ACP community registry
(https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json — checked; 46 agents, no
Command Code), so it must come from Argos itself.

## Goal

Add an Argos-curated agent overlay to `AcpRegistryService`: a small in-code list of curated agent
records (starting with Command Code) merged into every registry manifest — bundled seed, cached
snapshot, and upstream refresh. Upstream entries with the same id always win, so once Command Code
lands in the official registry, the official entry replaces the curated copy automatically.

## Acceptance Criteria

1. `command-code` appears in `AcpRegistryService.listAgents()` when the built-in seed / cache /
   upstream manifest lacks it, with `distribution.npx = { package: "command-code",
   args: ["acp"] }` — **unpinned**, so `npx` tracks the latest published release (cross-platform:
   npx resolves the `command-code` bin, avoiding the Windows `cmd`/`cmdc` alias problem).
2. Curated agents survive a successful upstream refresh whose manifest does not include them.
3. An upstream agent with the same id wins over the curated entry (no duplicates).
4. Curated records pass the service's normalizer (`normalizeAgent`) — invalid curated data is
   skipped, never crashes the registry.
5. Desktop `acpRegistryService.test.ts` covers 1–3; `bun run lint`, `bun run format`,
   acp-runtime `typecheck` pass.

## Constraints

- Follow the SDD workflow (this folder).
- Registry schema per `AcpRegistryAgent` (`@argos/shared/presenter`) and the bundled seed at
  `apps/desktop/resources/acp-registry/registry.json`.
- **Unpinned npx package** (`command-code`, not `command-code@x.y.z`): curated entries would go
  stale between registry updates since upstream doesn't publish Command Code yet; unpinned means
  `npx` always runs the latest release. The required record `version` field stays as the
  "authored against" marker — for `npx` distributions it is display/log metadata only (verified:
  no semver comparisons or install-state coupling on the npx path; binary distributions are the
  ones that couple version to install dirs).

## Non-Goals

- Submitting Command Code to the upstream ACP registry (upstream's own process).
- UI changes: the agent picker already renders registry agents generically.
- Bundled icon: `getIconMarkup` only accepts `cdn.agentclientprotocol.com` URLs, and no Command
  Code icon exists there yet; the UI falls back gracefully (add the icon when upstream lists it).

## Open Questions

- None.
