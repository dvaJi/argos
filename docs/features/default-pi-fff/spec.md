# Default Pi FFF package

## User need

Every Argos Pi agent should start with `@ff-labs/pi-fff` installed and enabled.

## Acceptance criteria

- New and existing Pi profiles receive the package once.
- The package is recorded in Pi's per-agent `settings.json` package list.
- A user can still remove the default package later.

## Constraints

- Do not alter unrelated installed packages.
- Do not install a global package or bypass Pi's package loader.

## Open questions

None.
