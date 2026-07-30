# Provider Settings Advanced Tab in Web Mode

## User Need

When Argos runs in daemon-served browser mode, provider settings should expose the same advanced controls that are available in the desktop app.

## Goal

Show the provider Advanced tab in web mode and keep its supported controls functional, including provider rate-limit editing.

## Acceptance Criteria

- The provider settings page shows the Advanced tab in browser mode.
- Rate-limit status loads in browser mode without throwing bridge errors.
- Saving provider rate-limit changes persists in browser mode.
- Desktop behavior remains unchanged.

## Constraints

- Keep the change limited to provider settings parity.
- Use the existing provider update route instead of inventing a new web-only API.

## Non-Goals

- Making every desktop-only settings pane browser-safe.
- Reworking the provider settings layout.

## Open Questions

- None.
