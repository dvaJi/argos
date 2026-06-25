# Consolidate Contract Catalogs — Specification

## Background

A runtime error `Unknown argos route: mcp.listMcpRouterServers` surfaced when the
desktop ran against the headless daemon. The route was registered in the desktop's
route catalog but missing from the catalog the daemon consults.

Investigation revealed the route contract surface is duplicated across **three live
catalogs** that were created by the in-progress `headless-backend-kernel` daemon
extraction and never consolidated:

| Catalog | Resolves via | Consumers |
|---------|--------------|-----------|
| `apps/desktop/src/shared/contracts/routes.ts` | desktop Vite alias `@shared` | desktop main + renderer |
| `packages/shared-contracts/src/routes.ts` | package `@argos/shared-contracts/routes` | daemon |
| `packages/shared/src/contracts/routes.ts` | alias `@shared/contracts` (daemon/backend-core tsconfig) | `@argos/backend-core` |

Each catalog is backed by its own duplicated tree of route-definition files
(`routes/*.routes.ts`), event contracts, and `common.ts`/`bridge.ts`, which have
also drifted (notably: the desktop tree is on the Zod v4 API — `z.record(K, V)`,
`z.nativeEnum` — while the package trees still use deprecated v3-style calls).

The root cause of the bug: adding a route in one universe (desktop) without
mirroring the registration into the other two. There is no mechanism today that
detects the drift before it reaches runtime.

## Goal

Make route-contract catalog drift impossible to ship silently, and define the path
to a single source of truth for route contracts.

## Acceptance Criteria

- **AC-1 (drift guard):** A lint-integrated check asserts the three live catalogs
  expose an identical set of registered route entries. Adding a route to one
  catalog without the others fails `pnpm run lint`.
- **AC-2 (no regression):** The guard passes on the current tree after the
  MCPRouter catalog fix is applied everywhere (already done).
- **AC-3 (documentation):** The full-consolidation path is recorded as a phased
  plan tied to the `headless-backend-kernel` migration, so it is not re-discovered.

## Constraints

- Do not break the desktop, daemon, or `backend-core` builds.
- The desktop contracts tree is the most evolved (Zod v4, extra routes). Any merge
  ports desktop → packages, not the reverse.
- Full single-source consolidation depends on converging the two parallel `@shared`
  type/presenter trees (`apps/desktop/src/shared` vs `packages/shared`), which is
  out of scope for this goal and tracked under `headless-backend-kernel`.

## Non-Goals

- Merging the two `@shared` type/presenter universes.
- Removing the daemon extraction duplication wholesale.
- Changing runtime behavior of any route.

## Open Questions

- None blocking AC-1. The long-term canonical home (package vs desktop) is decided
  by `headless-backend-kernel` and recorded in `plan.md`.
