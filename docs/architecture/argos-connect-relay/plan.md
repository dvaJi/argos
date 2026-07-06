# Plan

## Approach

- Local daemon links to a cloud account.
- Relay allocates a managed endpoint.
- Daemon initiates an outbound tunnel to the relay.
- Browser/mobile discovers linked environments through the cloud.
- All privileged operations still require daemon-issued `bearer-session` credentials; relay reachability never grants trust.

## Components

- **Argos Cloud API**:
  - environment registry.
  - user identity and ownership.
  - relay endpoint allocation.
- **Argos Relay**:
  - tunnel ingress + connection routing.
  - no durable access to user data or session secrets.
- **Local daemon**:
  - link/unlink commands.
  - environment keypair.
  - signed liveness/activity proof.
  - outbound tunnel client.
  - sets exposure mode to `relay` (`DaemonExposureConfig`), which requires `bearer-session` only.
- **Clients**:
  - discover environments via cloud.
  - pair (one-time token) or resume an existing `bearer-session` against the daemon through the relay tunnel.

## Security Model

- Cloud identity proves account ownership.
- Environment keypair proves daemon identity.
- Pairing/session auth (`pairing-and-session-auth`) proves client authorization to the daemon.
- Relay cannot bypass daemon auth — it is a transport, not an authority.
- Session credentials are end-to-end between client and daemon; the relay never sees plaintext tokens (the tunnel is opaque).

## Alignment With Foundations

- `connection-runtime-auth-model`: relay is the `relay` exposure mode; `bearer-session` is the only accepted credential kind. `AuthContext` is attached to every tunneled request.
- `daemon-transport-runtime`: WS RPC + auth-at-upgrade flows through the tunnel unchanged.
- `pairing-and-session-auth`: clients obtain `bearer-session` via pairing before using the relay, exactly as they would over LAN.
- `headless-web-access`: a browser may reach the daemon-served web UI through the relay, authenticated by its `browser-session` cookie.

## Testing Strategy

- Contract tests for the relay protocol before service implementation.
- Local fake relay for daemon integration tests.
- Threat model review before implementation.
- Verify relay cannot authenticate without a valid daemon session (reachability ≠ trust).
