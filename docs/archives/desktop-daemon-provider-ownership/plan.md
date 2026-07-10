# Plan

1. Audit the provider routes that already exist in the daemon dispatcher.
2. Split the desktop provider route handler into daemon-backed routes and desktop-only import routes.
3. Update the desktop main dispatcher to invoke the daemon for the daemon-backed routes.
4. Remove direct desktop presenter dependencies from the daemon-backed provider path.
5. Validate with targeted tests, format, and lint.

## Compatibility Notes

- Route contracts stay unchanged.
- Provider import scan/apply remain compatible with current desktop file-system behavior.
- The desktop renderer should not observe any API surface change.

## Test Strategy

- Extend daemon route coverage for provider catalog behavior if needed.
- Update desktop main route tests to prove daemon-backed provider routes are proxied.
- Keep provider import tests intact for the local desktop path.
