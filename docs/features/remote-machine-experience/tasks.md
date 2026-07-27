# Remote Machine Experience — Tasks

Tasks are ordered so each phase can land as a focused, reviewable slice. Do not
start UI replacement until the contract, credential, and migration decisions in
Phases 1–3 are implemented and tested.

## Phase 0 — Baseline and terminology

- [x] Inventory every user-facing use of workspace, daemon, server, remote,
      browser access, and Remote Control.
- [x] Record the current remote connection sequence from sidebar, settings,
      preload, client SDK, daemon auth, and workspace persistence.
- [x] Record current release asset names and install-script support per
      OS/architecture.
- [x] Add the approved terminology table to the durable product documentation.
- [x] Define the specific legacy `WorkspaceEntry` fields and active-selection
      behavior that must survive migration.

## Phase 1 — Environment and capability contracts

- [x] Add a persistent random daemon environment ID initialized once per data
      directory.
- [x] Add daemon storage migration and tests for environment identity.
- [x] Define the typed environment handshake schema: identity, daemon/protocol
      versions, runtime kind, capabilities, compatibility, display metadata.
- [x] Register the handshake route in `ARGOS_ROUTE_CATALOG`.
- [x] Implement the daemon handshake handler.
- [x] Add a stable capability catalog for daemon, browser, and native-only
      features.
- [x] Add protocol compatibility policy and tests.
- [x] Add server welcome/readiness data required to prove event transport.
- [x] Verify the handshake reveals no secrets or sensitive filesystem/config
      data.

## Phase 2 — Machine model and compatibility

- [x] Introduce the versioned `MachineEntry` persistence model.
- [ ] Separate machine connection terminology from project-folder/workspace
      terminology in types exposed to new UI.
- [x] Implement idempotent migration/adapter for existing remote
      `WorkspaceEntry` records.
- [x] Mark migrated remote records `pairing-required`; do not restore legacy raw
      credentials.
- [x] Preserve names, endpoints, creation timestamps, and active selection.
- [x] Detect duplicate machines by environment ID rather than URL.
- [x] Add identity-change/replacement state for a known endpoint.
- [x] Add rollback-safe migration tests and fixtures.

## Phase 3 — Secure Desktop credential storage

- [x] Define native-only typed routes for store/delete/resolve machine sessions.
- [x] Implement the routes using Electron safeStorage or the established native
      secure-storage adapter.
- [x] Return opaque credential references to renderer code.
- [x] Ensure bearer secrets never enter React state, workspace/machine JSON,
      localStorage, logs, toasts, or analytics.
- [x] Add an explicit `secure_storage_unavailable` error with remediation.
- [ ] Add store/reconnect/delete tests.
- [ ] Add regression tests that serialize relevant renderer/config state and
      prove the bearer value is absent.

## Phase 4 — Pairing parser and orchestrator

- [x] Define the canonical pairing link and human-enterable code formats.
- [x] Implement one shared pairing parser with URL normalization and redaction.
- [x] Reject unsupported protocols, userinfo, malformed endpoints, and invalid
      pairing paths.
- [ ] Implement the setup state machine from parsing through review/save.
- [x] Exchange the one-time token without returning it to UI business state.
- [x] Store the issued Desktop bearer session securely.
- [x] Establish an authenticated WebSocket connection.
- [x] Complete authenticated handshake and route round-trip verification.
- [ ] Close or adopt the verification transport deterministically.
- [ ] Delete newly issued credentials when cancelled before save.
- [ ] Implement stable error codes for every specified setup failure.
- [ ] Cover invalid, expired, consumed, unreachable, loopback, TLS, storage,
      version, identity, RPC, and readiness failures.

## Phase 5 — Connection runtime integration

- [x] Resolve remote credentials from secure storage at connection time.
- [x] Authenticate WebSocket without query-string tokens.
- [x] Persist non-secret last-known identity/version metadata after a
      successful connection.
- [x] Stop retry churn on revoked/invalid authentication and surface Pair again.
- [ ] Continue bounded/backoff reconnect for network failures.
- [ ] Fail closed when environment identity changes.
- [x] Support endpoint update when the environment identity remains the same.
- [ ] Prove remote route failures never fall back to local daemon execution.
- [ ] Add reconnect tests across Desktop and daemon restarts.

## Phase 6 — Exposure/start command matrix

- [x] Replace hard-coded install/start arrays with a typed supported-platform
      command matrix.
- [ ] Align each install command with an asset actually produced by the release
      workflow.
- [ ] Add `--version` coverage for every daemon artifact.
- [x] Define commands for loopback browser, trusted LAN/private overlay, and
      HTTPS/reverse-proxy deployments.
- [ ] Ensure no command suggests a LAN URL while binding only to loopback.
- [ ] Require explicit confirmation before showing network-accessible startup.
- [ ] Add service install/status/restart instructions for supported platforms.
- [ ] Add update, logs, health, data-directory, and uninstall commands.
- [ ] Add CI tests that fail when UI commands, asset names, and release workflow
      outputs diverge.

## Phase 7 — Setup wizard

- [ ] Replace `RemoteWorkspaceSetup` with a shared Connect Remote Machine wizard.
- [ ] Add use-case and Desktop-versus-Server introduction.
- [ ] Add platform/architecture and exposure-path selection.
- [ ] Add copyable install, verify, start, and pairing instructions.
- [ ] Make pairing link/code the default input.
- [ ] Move raw endpoint entry under Advanced.
- [x] Add explicit progress stages for reachability, exchange, authentication,
      handshake, events, and capabilities.
- [ ] Add a review screen with identity, endpoint, version, security summary,
      capabilities, limitations, and data-location statement.
- [ ] Offer separate Save and Save and switch actions.
- [ ] Implement every loading/error/recovery state listed in `spec.md`.
- [x] Remove all "pairing coming soon" copy.
- [ ] Add keyboard, focus, screen-reader status, QR alternative, responsive, and
      localization coverage.

## Phase 8 — Navigation and active context

- [x] Rename the daemon connection selector from Workspaces to Machines.
- [x] Rename Local to This computer in user-facing UI.
- [x] Rename Add Remote Workspace to Connect a remote machine.
- [x] Audit remaining "workspace" copy and retain it only for filesystem/project
      concepts or compatibility internals.
- [ ] Display the active machine before project selection and execution-sensitive
      actions.
- [ ] Ensure new sessions inherit the explicitly active machine.
- [ ] Prevent machine switching from silently moving active sessions.
- [ ] Include target machine name in relevant destructive confirmations.
- [ ] Visually and textually distinguish Remote Control integrations from remote
      machines.

## Phase 9 — Machine and session management

- [x] Redesign Server settings into This computer, Remote machines, Paired
      clients, and Advanced diagnostics sections.
- [x] Add machine status, identity abbreviation, endpoint, version, last
      connected, TLS/exposure summary, and capabilities.
- [x] Add Retry, Rename, Pair again, Edit address, Copy diagnostics, and Forget.
- [x] Add authenticated session list/revoke contracts and daemon handlers if not
      already exposed through the route catalog.
- [x] Terminate or promptly invalidate active connections after revocation.
- [x] Offer local forget and optional server-side revoke as distinct operations.
- [x] Explain that forgetting does not delete remote server data.
- [x] Handle partial failure where local removal succeeds but remote revocation
      cannot be completed.

## Phase 10 — Browser pairing alignment

- [x] Reuse the canonical pairing entry format in browser bootstrap.
- [x] Remove pairing token material from browser URL/history immediately after
      exchange.
- [ ] Verify HTTP-only cookie reconnect and expiry/revocation behavior.
- [x] Hide/disable unsupported browser/headless capabilities using the handshake
      catalog.
- [x] Eliminate controls that predictably fail with headless-only errors.
- [ ] Add browser smoke coverage for pair, reload, revoke, and re-pair.

## Phase 11 — Documentation and release positioning

- [x] Create/update the durable remote-machines guide.
- [x] Document Desktop versus Server and state that most users need only Desktop.
- [x] Document supported network topologies with diagrams.
- [x] Document install, exposure, pairing, browser access, lifecycle, data
      location, backup, updates, logs, revoke, uninstall, and troubleshooting.
- [x] Update landing/download copy to label Desktop as recommended and Server as
      advanced/headless.
- [x] Add release-note template sections for Desktop and Server assets.
- [x] Link the guide from the in-app wizard, settings, landing page, and release
      notes.
- [x] Verify commands in documentation against the shared command matrix.

## Phase 12 — Validation and rollout

- [x] Add unit coverage for parser, migration, identity, compatibility,
      capabilities, errors, and command matrix.
- [ ] Add daemon coverage for pairing, handshake, session revoke, exposure, and
      credential redaction.
- [ ] Add main/preload/client coverage for secure storage, authenticated
      transport, reconnect, and no-local-fallback.
- [ ] Add renderer coverage for happy path, all error states, accessibility, and
      terminology.
- [ ] Run clean Desktop local-only packaged smoke.
- [ ] Run clean server install + pair + Desktop connect smoke for every supported
      OS/architecture available in CI.
- [ ] Run Desktop restart, daemon restart, session revoke, URL change, identity
      change, and version-skew E2E scenarios.
- [ ] Run browser pairing/reload/revoke smoke.
- [ ] Run trusted LAN/private-network manual security smoke.
- [ ] Confirm no secrets in logs, diagnostics, persisted config, or telemetry.
- [x] Run `bun run format`.
- [x] Run `bun run lint`.
- [x] Run `bun run typecheck`.
- [ ] Run relevant main, renderer, daemon, and E2E test suites.
- [ ] Remove temporary feature flags and obsolete raw URL-first code.
- [ ] Fold durable facts into current guides/architecture docs and retire
      superseded active SDD folders according to repository policy.
