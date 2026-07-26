# Remote Machine Experience

## Status

Proposed. This SDD defines the complete user-facing product flow for installing,
pairing, using, maintaining, and removing a remote Argos environment.

This goal supersedes the remaining product decisions in
`docs/features/workspace-onboarding/` and coordinates, without rewriting the
historical implementation records in:

- `docs/features/pairing-and-session-auth/`
- `docs/features/server-exposure-settings/`
- `docs/features/daemon-cli-distribution/`
- `docs/features/headless-web-access/`
- `docs/architecture/argos-connect-relay/`

## Problem

Argos Desktop contains and automatically manages a local `argos-daemon`, while
GitHub releases also publish standalone daemon binaries for remote and headless
hosts. The runtime architecture is valid, but the product does not give users a
coherent model or a reliably successful setup path.

The current UI:

- calls both a daemon connection and a repository directory a "workspace";
- asks users for a daemon URL before explaining how to obtain one;
- instructs users to start a daemon that binds to loopback by default, then
  suggests connecting to a LAN address that cannot reach that loopback socket;
- says remote pairing is "coming soon" even though one-time pairing and sessions
  exist;
- validates only public `/health`, which does not prove authenticated WebSocket
  RPC works;
- does not explain which download a normal desktop user needs;
- does not explain where execution, files, configuration, and data live;
- does not expose a complete lifecycle for updating, reconnecting, revoking, or
  removing a remote machine.

This creates a high probability that a user follows the displayed instructions,
passes a health check, and still cannot use the remote environment.

## User Need

Users need to understand that Argos Desktop is the normal application and Argos
Server is an optional headless installation for another machine. When they
choose remote operation, Argos must guide them from installation through secure
pairing to a verified usable connection, without requiring prior knowledge of
ports, bind addresses, bearer credentials, or internal daemon architecture.

## Product Vocabulary

User-facing surfaces use these terms consistently:

| User-facing term | Meaning |
| --- | --- |
| **Argos Desktop** | The installed desktop application and its native capabilities. |
| **This computer** | The local environment backed by Desktop's private, managed daemon. |
| **Argos Server** | The headless Argos runtime installed on another machine. |
| **Remote machine** | A saved connection to an Argos Server. |
| **Project folder** | A filesystem directory selected for an agent/session. |
| **Browser access** | The web UI served by an Argos Server or an explicitly exposed Desktop-managed daemon. |
| **Remote Control** | Telegram, Discord, QQ, and similar messaging integrations; not remote-machine connectivity. |

`argos-daemon` remains the executable, package, log prefix, and developer-facing
name. It is shown to users only in install commands, diagnostics, and advanced
documentation.

The generic term **workspace** must not identify a remote machine in new UI.
Stored schema names may retain `WorkspaceEntry` temporarily for compatibility.

## Goal

Deliver one end-to-end remote-machine experience that:

1. explains the Desktop/Server distinction;
2. helps the user install and safely expose Argos Server;
3. pairs Desktop with the server using a short-lived, single-use credential;
4. verifies authenticated route and event transport before saving;
5. clearly switches execution context between this computer and remote machines;
6. explains data location and feature availability;
7. supports reconnection, version diagnosis, session revocation, update guidance,
   and removal;
8. positions standalone server artifacts clearly in releases and public docs.

## Personas and Primary Jobs

### Desktop-only user

Wants to download Argos once and use it locally without learning what a daemon
is or downloading a second binary.

### LAN or private-network user

Wants agents to operate on a workstation, NAS, or server reachable through a
trusted private network such as a LAN or Tailscale.

### Headless/VPS operator

Wants a persistent Argos Server, browser access, explicit data paths, service
management, updates, logs, backup, and secure reverse-proxy guidance.

### Returning client

Wants a saved remote machine to reconnect automatically and to receive useful
recovery actions when the server is offline, moved, upgraded, or revoked.

## User Stories

### Normal installation

As a normal user, I want the download page and first-run experience to tell me
that Argos Desktop is sufficient, so I do not mistakenly install a standalone
server.

### Discover remote capability

As a desktop user, I want "Connect a remote machine" to explain the benefits and
requirements before requesting technical input.

### Install a server

As an operator, I want an OS-specific, copyable install command and a verifiable
result, so I know I installed the official server binary.

### Pair securely

As a user, I want to paste a pairing link or scan/enter a pairing code, so Argos
can derive the endpoint and create a revocable session without exposing a
long-lived shared secret.

### Verify usability

As a user, I want Argos to save a remote machine only after authenticated
WebSocket RPC, event subscription, version compatibility, and required
capabilities succeed.

### Understand execution

As a user, I want the active machine to be obvious, so I know where commands,
files, models, tools, sessions, and persisted data are located.

### Recover

As a user, I want an offline remote machine to show diagnosis and recovery
actions without deleting its cached identity or silently falling back to local
execution.

### Revoke and remove

As a server owner, I want to list and revoke paired clients; as a client user, I
want removing a machine to delete its local credential and optionally revoke the
server session.

## Canonical User Flows

### Flow A: Local-only Desktop

1. User installs Argos Desktop.
2. Argos starts its private local daemon automatically.
3. Navigation shows **This computer** as the active machine.
4. No standalone server prompt or daemon terminology appears in normal use.

### Flow B: Connect a remote machine

1. User selects **Machines → Connect a remote machine**.
2. Intro explains use cases, data location, and that Argos Server is installed
   on the other machine.
3. User chooses the remote host OS and architecture, or selects "Already
   installed."
4. UI displays the supported install command plus signature/checksum behavior.
5. UI displays the canonical startup/pairing command for the selected network
   path.
6. Server prints a short-lived pairing URL and a human-enterable code. A QR code
   may be shown where practical.
7. User pastes the complete pairing URL/code into Desktop. Manual URL entry is
   available only under **Advanced**.
8. Desktop exchanges the one-time token for a bearer session and stores the
   credential using the platform secure-storage adapter.
9. Desktop establishes the authenticated WebSocket, invokes a typed
   `connection.describeEnvironment`/equivalent handshake, subscribes to a
   lightweight event, and checks version/capabilities.
10. User reviews the verified machine name, address, server version, security
    mode, and capability limitations.
11. User confirms; Desktop saves the machine and switches only when explicitly
    requested.

### Flow C: Browser access

1. Operator starts Argos Server with web serving enabled and an approved
   exposure mode.
2. Server prints a pairing URL.
3. Browser opens the URL, exchanges the one-time token for an HTTP-only session
   cookie, removes the token from visible/history state, and reconnects.
4. Browser displays only capabilities supported in browser/headless mode.

### Flow D: Reconnect and recovery

1. Desktop reconnects saved machines using their stored bearer sessions.
2. Cached machine identity remains visible while offline.
3. Failure is classified as network, TLS, authentication/revocation, version,
   server health, or capability failure.
4. UI offers relevant actions: Retry, Pair again, Copy diagnostics, Edit address,
   View server instructions, or Remove machine.
5. Argos never executes a remote-targeted action on This computer as a fallback.

### Flow E: Removal

1. User selects **Forget this machine**.
2. UI explains that this removes the connection, not server data.
3. If connected, user can also revoke this client's server session.
4. Local secure credential, cached machine metadata, and connection state are
   removed.
5. Remote sessions/projects/data remain unchanged unless separately deleted on
   the server.

## Functional Requirements

### 1. Product explanation

- Download/release copy identifies Desktop as the default for most users.
- Standalone daemon assets are labeled **Argos Server — advanced/headless**.
- In-app machine setup contains a concise Desktop-versus-Server comparison.
- Remote machine connectivity and messaging Remote Control are clearly
  separated.

### 2. Installation guidance

- Provide working commands for every daemon asset actually published.
- Detect or ask for OS and architecture.
- Commands install a versioned, checksummed binary and make the resulting
  command discoverable.
- The flow includes `--version`, health, logs, service installation, update, and
  uninstall guidance.
- Unsupported platform/architecture combinations fail explicitly.

### 3. Exposure guidance

- The setup flow never suggests a non-loopback address while starting a
  loopback-only daemon.
- Supported first release paths are:
  - same-machine browser access through loopback;
  - LAN/private-network access with explicit `network-accessible` opt-in and
    session authentication;
  - HTTPS reverse proxy or private overlay network documented as the preferred
    internet-distance path.
- Direct unauthenticated public-internet exposure is never recommended.
- Relay is hidden or labeled unavailable until implemented.

### 4. Pairing

- Pairing is the default connection method.
- Pairing credentials are short-lived, single-use, rate-limited, and hashed at
  rest.
- Pairing input accepts the canonical full link and a human-enterable code.
- Endpoint data is derived from signed/server-issued pairing material or the
  pairing link, not manually retyped.
- A pairing exchange returns a revocable bearer session for Desktop.
- Desktop stores the bearer secret outside renderer state and normal config.
- Browser pairing uses an HTTP-only cookie.
- Failed, consumed, and expired tokens produce distinct recovery guidance.

### 5. Authenticated verification

`GET /health` may be used for preliminary reachability only. A machine is not
saved as usable until all of these pass:

- pairing/session exchange or existing-session authentication;
- authenticated WebSocket connection;
- typed environment handshake;
- one route round-trip;
- event subscription acknowledgement or deterministic server welcome;
- protocol/version compatibility check;
- stable environment identity check;
- minimum capability check for the selected client.

### 6. Stable identity

- Each daemon has a persistent, random environment ID independent of URL,
  hostname, data-directory display name, and session credential.
- Saved machines key reconnection and duplicate detection by environment ID.
- Address changes update the existing machine after identity confirmation.
- A different environment appearing at a known URL triggers a trust warning and
  requires explicit replacement.

### 7. Machine management

- Users can view name, status, URL, environment ID abbreviation, server version,
  last connected time, exposure/TLS summary, and capabilities.
- Users can rename, retry, re-pair, edit an advanced address, copy diagnostics,
  and forget a machine.
- Server owners can list and revoke paired sessions.
- Revocation terminates or promptly invalidates active transport.

### 8. Active-context clarity

- Main navigation uses **Machines**, not **Workspaces**, for daemon connections.
- The active machine is visible whenever an action may touch files or execute a
  process.
- New sessions inherit the explicitly active machine.
- Switching machines does not silently migrate an active session.
- Remote-targeted actions never fall back to the local daemon.

### 9. Capability communication

- The handshake returns typed capabilities, runtime kind, protocol version,
  server version, and native/headless limitations.
- UI hides or disables unavailable desktop-only actions with a reason.
- Browser mode does not show controls that can only fail with "not available in
  headless mode."
- Version mismatch distinguishes compatible warning from blocking protocol
  mismatch.

### 10. Data and lifecycle disclosure

The setup summary and documentation explain:

- agent commands and filesystem operations execute on the selected machine;
- project paths refer to that machine's filesystem;
- server sessions, configuration, plugins, skills, MCP configuration, and
  database live in the server data directory unless a feature explicitly syncs;
- closing Desktop does not stop a separately installed server;
- closing Desktop does stop only the Desktop-owned sidecar according to normal
  lifecycle rules;
- forgetting a machine does not delete server data;
- backup, update, logs, service, and uninstall behavior.

## Security and Privacy Requirements

- No raw shared secret in query parameters, renderer state, local storage,
  logs, telemetry, screenshots, or diagnostics.
- The one-time pairing token may appear in the initial pairing URL but must be
  removed from browser-visible/history state immediately after exchange.
- Desktop bearer sessions use OS-backed secure storage through a native-only
  typed route.
- TLS certificate errors are not bypassed. Trust-on-first-use, if later added,
  requires a separate security design.
- Plain HTTP is permitted only for loopback or explicitly confirmed private
  network use. UI warns when a non-loopback HTTP endpoint is selected.
- Pairing output must not imply that network reachability provides trust.
- Diagnostics redact session material and sensitive URL components.
- Daemon privileged routes remain authenticated in every non-desktop-bootstrap
  context.
- Session revocation is auditable and invalidates future requests immediately.

## UX States

The setup and management UI must explicitly design and test:

- intro / choose use case;
- choose platform;
- installation instructions;
- waiting for pairing input;
- exchanging token;
- checking reachability;
- authenticating;
- verifying capabilities;
- success summary;
- expired/consumed/invalid pairing;
- unreachable host;
- loopback-address-from-another-machine error;
- TLS/certificate failure;
- authentication revoked;
- compatible version warning;
- incompatible protocol block;
- environment identity changed;
- server healthy but authenticated RPC unavailable;
- saved machine offline/reconnecting;
- removing locally;
- revoking remotely;
- partial failure where revocation fails but local removal succeeds.

## Accessibility and Internationalization

- The flow is keyboard-complete with deterministic focus movement.
- Status is never communicated only by color.
- Progress and connection changes use appropriate live regions without
  repeatedly announcing reconnect attempts.
- QR is always accompanied by a copyable link/code.
- Command blocks support horizontal overflow and copy confirmation.
- All new user-facing strings use the repository's localization system.
- Terminology remains consistent in every supported locale.

## Acceptance Criteria

### Product comprehension

- [ ] A first-time user can identify Desktop as the only required normal
      download without opening external documentation.
- [ ] The app explains Argos Server and remote machines before showing technical
      fields.
- [ ] No new user-facing connection surface uses "workspace" to mean a machine.
- [ ] No shipped UI says pairing is coming soon.

### Successful setup

- [ ] A clean remote host can be installed using an in-app command for every
      supported published platform.
- [ ] The displayed start command creates a reachable endpoint appropriate for
      the selected exposure path and emits a pairing entrypoint.
- [ ] Desktop can accept a pairing link/code, obtain a secure session, complete
      authenticated verification, save the machine, and reconnect after restart.
- [ ] A public `/health` response alone can never cause a machine to be marked
      connected or saved as verified.

### Safety

- [ ] No setup path recommends unauthenticated public exposure.
- [ ] Non-loopback HTTP requires a warning and explicit confirmation.
- [ ] Session credentials are stored via native secure storage and never in the
      persisted workspace/machine JSON.
- [ ] Pairing tokens are single-use, expire, and are redacted after exchange.
- [ ] Identity changes and TLS failures fail closed.

### Daily use and recovery

- [ ] The active machine is visible before filesystem/process-affecting actions.
- [ ] Remote disconnect never falls back to local execution.
- [ ] Offline, revoked, incompatible, and unreachable states have distinct
      recovery actions.
- [ ] Users can re-pair, edit an address, revoke a session, and forget a machine.
- [ ] Removing a machine explains and preserves remote data.

### Documentation and distribution

- [ ] Release notes label Desktop versus Server assets and recommend Desktop for
      most users.
- [ ] A durable remote-server guide covers install, exposure, pairing, service,
      update, logs, backup, revoke, uninstall, and troubleshooting.
- [ ] In-app instructions and public documentation are generated from or tested
      against the same supported command matrix.

## Compatibility and Migration

- Existing `WorkspaceEntry` records with `mode: "remote"` migrate in place to
  the new machine model or are read through a compatibility adapter.
- Existing remote URLs remain visible but are marked **Pairing required** until
  an authenticated environment identity and secure credential are established.
- No legacy raw auth token is restored or migrated.
- `LOCAL_WORKSPACE_ID` may remain an internal compatibility constant, but new UI
  uses **This computer**.
- Stored project folders and chat session associations are not rewritten as
  machine records.
- Rollback must not delete legacy remote entries or server-side sessions.

## Constraints

- Preserve the Electron shell → typed bridge → local/remote daemon boundary.
- New UI business code uses typed clients and must not add legacy presenter
  access.
- Native secure storage and OS integration stay desktop-owned.
- Remote/backend behavior stays daemon-owned.
- The daemon remains independently usable in headless and browser modes.
- No cloud account is required for LAN/private-network pairing.
- Release tags remain unified between Desktop and daemon for now.

## Non-Goals

- Implementing Argos Connect relay or cloud discovery.
- Automatic router configuration, UPnP, firewall mutation, DNS, certificate
  issuance, SSH deployment, or Tailscale installation.
- Multi-user daemon tenancy or role-based access control.
- Deleting remote server data from the Desktop removal flow.
- Hiding the daemon process inside the Desktop package.
- Making every Electron-native capability available in a browser.
- Independent Desktop and Server versioning.

## Decisions

- Pairing link/code is the canonical setup input; raw server URL is advanced.
- **Machine** is the connection concept; **project folder** is the filesystem
  concept.
- Desktop remains the recommended default download; standalone daemon assets are
  positioned as Argos Server for advanced/headless use.
- `/health` is reachability-only, never proof of an authenticated usable
  environment.
- Persistent environment identity, authenticated handshake, and capability
  negotiation are required before save.
- Private overlay network or HTTPS reverse proxy is recommended for access
  beyond a trusted LAN. Relay remains unavailable until implemented.
- Existing remote URL records require re-pairing rather than receiving an
  insecure compatibility credential.

## Open Questions

None blocking. Future relay discovery, automatic server deployment, and
certificate trust automation require separate SDDs.

