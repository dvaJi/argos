# Web and VPS Positioning

## User need

People evaluating Argos need an accurate public answer to whether they can run
the daemon on a VPS and use the browser UI without Electron.

## Goal

Update the marketing landing and daemon handbook to present headless web use as
a supported single-user deployment, while clearly describing desktop-only
capabilities and the HTTPS/reverse-proxy boundary.

## Acceptance criteria

- Landing copy states that Argos can run as a daemon-served web workspace.
- The landing links prospective server operators to the daemon handbook.
- The handbook explains browser pairing, persistent server data, and the
  single-user scope.
- The handbook gives a VPS deployment shape: daemon on loopback, HTTPS reverse
  proxy in front, and no direct public daemon port.
- Documentation does not claim the removed `ARGOS_TOKEN` authentication model.
- Desktop-only capabilities are named without implying browser parity.

## Constraints

- Do not change daemon behavior or make a security promise the runtime does not
  enforce.
- Preserve the landing routes, visual theme, and existing download paths.
- Keep the guidance concise and actionable.

## Non-goals

- Implement proxy support, TLS termination, multi-user accounts, or a Docker
  deployment.
- Make desktop-only capabilities available in the browser.

## Open questions

None.
