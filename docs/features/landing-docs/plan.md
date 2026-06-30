# Landing Docs Route Plan

## Approach

Add a static `apps/landing/src/routes/docs.tsx` route that renders a documentation page with a sticky sidebar and article sections. Keep the page self-contained so the landing app does not need a new markdown pipeline.

## Affected Files

- `apps/landing/src/routes/docs.tsx`: new docs route and content.
- `apps/landing/src/components/SiteHeader.tsx`: add `/docs` to navigation.
- `apps/landing/src/components/Footer.tsx`: add `/docs` to footer navigation.
- `apps/landing/src/routeTree.gen.ts`: regenerate or update generated TanStack route types.

## Content Sources

- `distro/README.md` for install and update commands.
- `apps/daemon/src/index.ts` for CLI options and environment variables.
- `distro/systemd/argos-daemon.service` for managed service guidance.

## Compatibility

The docs route is static and uses existing landing dependencies. It does not affect desktop, daemon, shared contracts, or runtime packaging.

## Validation

Run focused landing checks first:

- `pnpm --filter @argos/landing typecheck`
- `pnpm --filter @argos/landing build`

Then run repo-required completion checks if feasible:

- `pnpm run format`
- `pnpm run i18n`
- `pnpm run lint`
