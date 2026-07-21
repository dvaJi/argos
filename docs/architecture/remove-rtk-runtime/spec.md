# Remove RTK runtime

## Goal

Remove the unused RTK runtime and every production dependency on its command rewriting, health checks, dashboard data, and UI badges.

## Acceptance criteria

- RTK is not installed or packaged.
- No production source imports or resolves the RTK binary.
- No startup health check, dashboard field, or message badge references RTK.
- Shell commands run directly without RTK rewriting.

## Constraints

- Preserve bundled `uv` and `ripgrep`.
- No fallback to the removed custom agent runtime.

## Open questions

None.
