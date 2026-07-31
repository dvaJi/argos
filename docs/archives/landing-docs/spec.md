# Landing Docs Route

## User Need

Visitors need public documentation beyond the marketing landing page, especially for running Argos headlessly with `argos-daemon`. The current landing page has install snippets, but it does not explain daemon setup, update behavior, settings, service usage, or where to go next.

## Goal

Add a `/docs` route to `apps/landing` with a docs-style layout focused on the daemon: what it is, how to install it, how to run it, how to keep it updated, how to configure settings, and how to deploy it as a service.

## Acceptance Criteria

1. The landing app exposes a `/docs` route.
2. The main landing header and footer link to `/docs`.
3. The docs page includes daemon install commands for Homebrew, macOS/Linux shell, and Windows PowerShell.
4. The docs page documents common daemon options and environment variables.
5. The docs page documents update commands, startup update checks, and the `--no-update-check` override.
6. The docs page points users to the GitHub repository for releases, issues, and source docs.
7. The page remains static content inside `apps/landing` and does not add a docs framework or CMS.

## Constraints

- Keep this increment scoped to the landing app and SDD documents.
- Reuse existing TanStack Router file routing.
- Keep copy aligned with `distro/README.md`, `distro/systemd/argos-daemon.service`, and the daemon CLI help.
- Do not change daemon behavior.

## Non-goals

- No searchable docs index.
- No MDX pipeline.
- No versioned documentation.
- No API reference generation.

## Open Questions

Resolved:
- Use a hand-authored React docs page for this increment, inspired by the compact docs-shell pattern in the provided reference.
