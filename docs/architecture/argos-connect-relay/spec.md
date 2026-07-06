# Argos Connect Relay

## User Need

Users should eventually access their Argos environment from another browser or mobile device without manually exposing ports or configuring their own tunnel.

## Goal

Define a future relay/cloud architecture for discovering and reaching Argos daemon environments.

## Acceptance Criteria

- Relay provides reachability, not implicit trust.
- Daemon remains the authority for local data and sessions.
- Cloud identity links users to environments.
- Remote clients authenticate with cloud and then pair/session-auth with the daemon.
- Relay can be implemented as a separate service/repo without changing local daemon fundamentals.
- Relay exposure mode (`connection-runtime-auth-model`) requires `bearer-session` auth only; no shared secret is accepted.

## Constraints

- Depends on the now-complete foundations: `connection-runtime-auth-model` (auth model + `AuthContext`), `daemon-transport-runtime` (WS RPC + auth at upgrade), `pairing-and-session-auth` (one-time pairing + revocable sessions), and `headless-web-access` (daemon-served web UI).
- Must not require cloud for local desktop or LAN use.
- Must preserve self-hosted/manual access paths.
- Relay must never see plaintext session credentials or user data.

## Non-Goals

- Implementing relay service now.
- Choosing a cloud provider.
- Adding billing, teams, or shared workspaces.

## Decisions

- The `relay` exposure mode (`DaemonExposureConfig` from `connection-runtime-auth-model`) requires `bearer-session` auth for all privileged surfaces. No `legacy-token`/shared secret exists to accept (clean-break).
- Relay is a separate service/repo from the daemon; the daemon only needs an outbound tunnel client.
- Cloud identity and daemon auth are separate layers: cloud proves account ownership, the environment keypair proves daemon identity, pairing/session proves client authorization.

## Open Questions

- Should relay be WebSocket reverse tunnel, HTTP CONNECT, QUIC, or a managed tunnel binary?
- Should cloud identity be first-party, GitHub OAuth, Clerk-like provider, or pluggable?
- What environment metadata is safe to publish to cloud?
