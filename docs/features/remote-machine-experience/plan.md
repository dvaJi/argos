# Remote Machine Experience — Implementation Plan

## Delivery Strategy

Deliver this as reviewable vertical slices. First establish contracts and secure
credential ownership, then implement the pairing/verification service, then
replace the UI terminology and setup flow, and finally align distribution,
documentation, and release presentation.

The implementation reuses the completed pairing, exposure, WebSocket, and
headless-web foundations. It must remove obsolete UX rather than introduce a
second connection flow.

## Current-to-Target Flow

### Current

```text
Add Remote Workspace
  -> manually enter URL
  -> GET /health
  -> persist URL
  -> switch WebSocket transport
```

This proves only reachability and has no coherent session acquisition step.

### Target

```text
Connect remote machine
  -> choose install/exposure path
  -> paste pairing link or code
  -> exchange one-time token in native main/secure client
  -> store bearer session in secure storage
  -> authenticated WebSocket connect
  -> environment handshake + welcome/event readiness
  -> verify identity/version/capabilities
  -> persist non-secret machine metadata
  -> optionally activate machine
```

## Ownership

| Responsibility | Owner |
| --- | --- |
| Machine metadata and compatibility migration | `@argos/shared` / renderer machine store |
| Pairing, session issuance, environment identity | daemon |
| Bearer credential storage | Electron main native adapter |
| Pairing orchestration and verification | typed desktop route/client plus client SDK |
| Active-machine transport switching | preload/client SDK connection runtime |
| Install/start instructions | shared command matrix consumed by UI/docs tests |
| Exposure policy | daemon + Desktop server settings |
| Setup and management UI | `@argos/ui` |
| Release asset positioning | release workflow/release notes/landing docs |

## Shared Contracts

Add or extend contracts under `packages/shared-contracts/src/routes/` and the
route catalog. Exact domain naming should follow the existing catalog; preferred
operations are:

### Public/bootstrap

- `connection.getPairingMetadata`
  - validates/parses a pairing entrypoint without exposing secrets to business UI;
  - returns display-safe endpoint, expiry, and server identity hint where
    available.
- Existing pairing exchange endpoint remains the only token-to-session bootstrap
  surface.

### Authenticated

- `connection.describeEnvironment`
  - input: client version, protocol version, runtime kind, required capability
    set;
  - output:
    - persistent `environmentId`;
    - display name/hostname;
    - daemon and protocol versions;
    - runtime kind;
    - capability IDs;
    - exposure/TLS summary safe for display;
    - server time;
    - compatibility result.
- `connection.verify`
  - optional named round-trip if `describeEnvironment` and welcome readiness do
    not already prove the complete boundary.
- `auth.sessions.list`
- `auth.sessions.revoke`
- `auth.sessions.revokeCurrent`

The environment handshake must be Zod-validated and versioned. It must not leak
filesystem roots, credentials, or configuration secrets.

## Data Model

Introduce a user-facing machine model while preserving legacy storage:

```typescript
type MachineEntry = {
  id: string; // client-local record id
  environmentId: string | null; // null only for legacy/unpaired record
  name: string;
  kind: "local" | "remote";
  endpoint: string | null;
  createdAt: number;
  lastConnectedAt?: number;
  lastKnownServerVersion?: string;
  lastKnownProtocolVersion?: string;
  lastKnownCapabilities?: string[];
  credentialRef?: string; // opaque secure-storage reference, never the secret
  trustState: "managed-local" | "paired" | "pairing-required";
};
```

Rules:

- The local managed machine has a stable reserved client ID and obtains its
  environment identity from its daemon.
- Remote duplicates are detected by `environmentId`, not normalized URL.
- Endpoint is metadata and may change.
- The secret is stored by a native secure credential service keyed by an opaque
  `credentialRef`.
- Browser clients rely on cookies and do not persist `credentialRef`.
- Existing `WorkspaceConfig` receives a schema version and deterministic,
  idempotent migration or a compatibility adapter.

## Secure Credential Adapter

Add typed native-only operations, using Electron safeStorage or the repository's
existing secure-storage abstraction:

- `credentials.storeMachineSession`
- `credentials.getMachineSession` (available only to preload/main connection
  orchestration, not general renderer business code)
- `credentials.deleteMachineSession`

Renderer code receives only success state and an opaque reference. Secret values
must not cross into React state, localStorage, toast content, logs, or analytics.

If secure storage is unavailable, pairing fails with a supported error and
remediation; plaintext fallback is prohibited.

## Pairing Entry Parsing

Create one parser in a shared non-UI client module:

- accepts canonical `http(s)://.../pair?token=...` links and supported
  human-enterable codes;
- rejects unsupported protocols, embedded userinfo, malformed ports, expired
  metadata, and non-pairing paths;
- normalizes the base endpoint;
- ensures token values are redacted from errors and structured logs;
- passes the token directly to the exchange layer without returning it to UI
  display state.

After browser exchange, use `history.replaceState` to remove pairing material
from the address bar and history before mounting the authenticated app.

## Pairing and Verification Orchestrator

Implement a single state machine/service used by both the sidebar dialog and
settings:

```text
idle
  -> parsing
  -> reaching-server
  -> exchanging
  -> storing-credential
  -> connecting-transport
  -> handshaking
  -> verifying-events
  -> review
  -> saving
  -> complete
```

Failure states retain safe retry context but never retain token material:

- invalid/expired/consumed pairing;
- unreachable/DNS/refused/timeout;
- loopback endpoint supplied for another machine;
- TLS/certificate;
- unsupported protocol;
- incompatible server;
- identity conflict;
- secure-storage unavailable;
- authenticated RPC failure;
- event readiness failure.

Cancellation aborts fetch/transport work and deletes a newly issued credential
if the machine has not been saved.

The renderer may display preliminary reachability guidance, but it must not add
`/health` as a post-pairing save condition. The native pairing result is usable
only after authenticated transport, handshake, route, event, compatibility, and
identity verification; a public health endpoint is neither necessary nor
sufficient for that decision.

## Transport Integration

- Extend the connection runtime so a remote machine resolves its bearer session
  from native secure storage at connection time.
- Prefer authorization header or the existing approved WebSocket first-message
  mechanism; never use `?token=`.
- Keep one supervisor/retry owner per active machine.
- A save-time verification connection must be adopted by the runtime or closed
  deterministically to avoid duplicate sockets.
- Reconnection resolves the current endpoint and credential at execution time.
- Authentication failures stop retry churn and surface **Pair again**.
- Network failures retain automatic backoff.
- A changed environment identity at an existing endpoint stops connection and
  requests explicit trust/replacement.

## Daemon Identity and Capability Handshake

- Generate a random environment ID on first daemon data-directory
  initialization.
- Persist it in daemon storage/database.
- Never derive it from hostname, MAC address, IP, data path, or install ID.
- Include it in authenticated handshake responses and server welcome.
- Return a stable capability catalog derived from registered daemon routes and
  explicit browser/headless/native capability declarations.
- Define protocol compatibility policy:
  - same supported protocol range: connect;
  - server/app version difference with compatible protocol: warning;
  - unsupported protocol: block with update guidance.

## Exposure and Startup Guidance

Replace static `RUN_COMMANDS` with a typed supported command matrix. Example
conceptual modes:

### This-computer browser

```text
argos-daemon --host 127.0.0.1 --web --pair
```

### Trusted LAN/private overlay

```text
argos-daemon --host 0.0.0.0 --web --pair
```

This command is shown only after explicit network-access confirmation and with
firewall/private-network guidance. If the actual CLI requires an exposure flag,
use that flag as the policy-bearing source rather than relying only on `--host`.

### Internet/VPS

Recommend binding loopback behind an authenticated HTTPS reverse proxy or a
private overlay network. Provide a durable guide; do not attempt to configure
the proxy/network automatically.

The command matrix includes:

- supported OS/architecture;
- install command;
- start/pair command;
- health/version command;
- service install/status/restart command where supported;
- update and uninstall command;
- documentation anchor.

Tests fail when UI-advertised asset names or commands diverge from release output.

## UI Information Architecture

### Main navigation

Rename the daemon selector:

```text
BEFORE
Workspaces
  Local
  Build server
  + Add Remote Workspace

AFTER
Machines
  This computer
  Build server
  + Connect a remote machine
```

Project/repository panels retain **Workspace** only where it means a filesystem
working directory; prefer **Project folder** in new copy.

### Setup wizard

Use one responsive wizard/sheet/dialog shared by sidebar and settings:

1. **Why use a remote machine?**
   - persistent work;
   - remote files;
   - stronger hardware;
   - browser/headless access.
2. **Prepare the other machine**
   - platform selector for the other machine (the installer detects its supported architecture);
   - install and verify;
   - exposure choice and warning;
   - start/pair command.
3. **Pair**
   - pairing link/code input;
   - optional QR scan when a supported camera surface exists;
   - Advanced manual address entry.
4. **Verify**
   - explicit progress stages;
   - actionable failures.
5. **Review**
   - verified name, endpoint, ID abbreviation, version, capabilities, TLS/network
     summary, and data-location statement.
6. **Finish**
   - Save;
   - Save and switch.

Do not persist on initial health success. Do not automatically switch before
review.

### Machine management settings

Replace the mixed Workspaces/Browser Access page with clear sections:

- This computer / local server exposure and browser access;
- Paired remote machines;
- Paired clients allowed to access this server;
- Advanced server diagnostics.

Remote machine cards provide Status, Retry, Pair again, Rename, Edit address,
Copy diagnostics, Forget, and—when connected—Revoke this client.

### Active context

- Show the active machine in the sidebar selector and session creation surface.
- Add machine context near project folder selection when ambiguity is possible.
- Confirmation dialogs for destructive filesystem/process operations include
  the machine name when they target remote state.

## Release and Public Documentation

### GitHub release

Keep daemon assets because they are required for headless installation, but
release notes group/label them conceptually:

- **Argos Desktop — recommended for most users**
- **Argos Server — remote/headless hosts**
- updater metadata is not presented as a user choice in prose.

If GitHub's flat asset list cannot be grouped, use unmistakable release-note
copy and consistent asset names. A separate server release channel is deferred.

### Durable guide

Create/update a current guide outside the completed SDD folder, such as
`docs/guides/remote-machines.md`, covering:

- Desktop versus Server;
- supported topology diagrams;
- install per OS;
- exposure choices;
- pairing;
- browser access;
- service lifecycle;
- data directory and backups;
- updating;
- logs and diagnostics;
- session list/revocation;
- uninstall;
- troubleshooting matrix;
- feature limitations.

Landing/download surfaces link directly to this guide.

## Compatibility and Migration

1. Add a storage schema version.
2. Read legacy remote `WorkspaceEntry` values.
3. Convert display metadata into `MachineEntry` with:
   - `environmentId: null`;
   - `credentialRef: undefined`;
   - `trustState: "pairing-required"`.
4. Preserve endpoint, name, creation time, and active selection.
5. On next selection, show re-pairing rather than attempting insecure access.
6. After successful pairing, populate environment identity and secure reference.
7. Keep a rollback-safe copy/version boundary; do not delete legacy data during
   the first compatible release.

## Error Taxonomy

Define stable error codes at the contract boundary:

- `pairing_invalid`
- `pairing_expired`
- `pairing_consumed`
- `endpoint_unreachable`
- `endpoint_loopback_remote`
- `tls_untrusted`
- `session_revoked`
- `secure_storage_unavailable`
- `protocol_incompatible`
- `environment_identity_changed`
- `authenticated_rpc_failed`
- `event_readiness_failed`
- `capability_missing`

UI maps codes to localized recovery copy. Raw transport errors remain available
only in redacted diagnostics.

## Observability

- Structured lifecycle logs use record IDs/environment ID abbreviations, never
  tokens or bearer sessions.
- Record pairing stage duration, failure code, protocol versions, and reconnect
  state locally.
- Any product analytics are opt-in/consistent with existing privacy controls and
  contain no hostnames, IPs, URLs, project paths, environment IDs, or secrets.
- **Copy diagnostics** includes app/server/protocol versions, runtime kind,
  redacted endpoint classification, capability IDs, and stable error code.

## Test Strategy

### Unit

- pairing link/code parser and redaction;
- machine schema migration and duplicate detection by environment ID;
- compatibility/version policy;
- capability projection;
- error-code-to-recovery mapping;
- install/start command matrix and release asset mapping.

### Daemon

- persistent environment identity;
- pairing exchange cases;
- authenticated handshake;
- session list/revoke and active connection invalidation;
- capability response;
- no credential leakage in logs/errors;
- exposure-mode enforcement.

### Desktop main/preload/client SDK

- secure credential store/get/delete;
- secret never returned to renderer business state;
- pairing orchestration cancellation cleanup;
- authenticated WebSocket connection;
- reconnect using secure credential;
- revoked auth stops retry and requests re-pair;
- identity mismatch fails closed;
- remote failure never routes to local daemon.

### Renderer

- complete wizard happy path;
- every specified failure state and recovery action;
- terminology and active-machine context;
- keyboard/focus/live-region behavior;
- legacy machine re-pairing;
- remove versus revoke behavior;
- browser capability hiding.

### End-to-end

Run packaged or production-equivalent tests for:

1. clean Desktop local-only use;
2. clean daemon install artifact + start + pair + Desktop connect;
3. Desktop restart and authenticated reconnect;
4. daemon restart and reconnect;
5. browser pairing and cookie reconnect;
6. expired/consumed token;
7. session revoke while connected;
8. URL change with same environment identity;
9. identity change at same URL;
10. compatible and incompatible version combinations;
11. trusted LAN/private overlay topology;
12. packaged Desktop with embedded local daemon unaffected.

The Windows ARM64 gate also executes the DuckDB/VSS runtime smoke before
packaging. Its resolver must load DuckDB through `@argos/desktop`, where that
native dependency is declared, rather than assuming it is hoisted at the
workspace root. Native modules are rebuilt by electron-builder for the package
target; dependency installation must not perform a separate target rebuild.

## Rollout

### Phase 1 — Contract and secure foundation

Ship environment identity, handshake/capabilities, secure credential adapter, and
legacy read compatibility behind an internal feature flag if needed.

### Phase 2 — Canonical pairing flow

Ship the orchestrator and new wizard. Remove the raw URL-first flow and obsolete
"coming soon" copy in the same release.

### Phase 3 — Management and recovery

Ship machine cards, session revocation, diagnostics, and active-context
clarification.

### Phase 4 — Distribution and docs

Align command matrix, release notes, landing/download copy, and durable guide.

### Phase 5 — General availability

Complete packaged cross-platform smoke tests, remove temporary flags and legacy
write paths, and archive/fold completed SDD records according to repository
policy.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Pairing flow exposes secrets to React/logs | Native orchestration, opaque credential refs, redaction tests. |
| Users expose daemon publicly over HTTP | Explicit mode confirmation, warnings, docs favor private overlay/HTTPS. |
| Existing remote entries stop working | Preserve metadata and provide guided re-pairing; no insecure token restoration. |
| URL reused by another daemon | Persistent environment identity and fail-closed replacement flow. |
| UI and install commands drift from releases | Shared command matrix plus CI asset/command validation. |
| Version skew breaks connection | Protocol handshake and compatibility policy before save. |
| Duplicate verification/runtime sockets | Adopt or deterministically close verification transport. |
| "Machine" rename conflicts with filesystem workspace | Schema compatibility adapter and scoped terminology migration. |
| Revocation races active WebSocket | Server-side per-request/session validation plus explicit socket termination. |

## Definition of Done

- Every acceptance criterion in `spec.md` is complete.
- Old remote URL-first onboarding and "pairing coming soon" copy are removed.
- No secret is persisted outside approved secure storage/session cookies.
- Cross-platform install commands match real release assets.
- Packaged Desktop local use and remote pairing pass end-to-end.
- Durable user documentation is published and linked in-app.
- `bun run format`, `bun run lint`, `bun run typecheck`, and relevant Vitest/E2E
  suites pass.
