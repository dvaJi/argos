# Remote machines

Argos has two ways to run an environment:

- **This computer** is managed automatically by Argos Desktop. Most users only
  need the Desktop download.
- **Argos Server** is the headless `argos-daemon` process installed on another
  computer, server, VPS, or private-network host. It owns the projects, agent
  processes, configuration, and database on that machine.

Argos Desktop connects to a remote server as a **remote machine**. This is
separate from **Remote Control**, which means Telegram, Discord, QQ, and other
messaging integrations.

## Install Argos Desktop

Download the desktop installer for your operating system from GitHub Releases.
You do not need a separate daemon download for local use; Desktop starts and
stops its private local server automatically.

## Install Argos Server

Use a standalone `argos-daemon` release asset only on the machine that should
run agents remotely. The release page labels these assets **Argos Server —
advanced/headless**. Each published Server asset is one self-contained
executable; it does not require a repository checkout or a separate Bun,
Node.js, or DuckDB installation.

Standalone Argos Server releases are currently published for Linux and Windows:

```text
# Linux
curl -fsSL https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.sh | ARGOS_VERSION=v0.2.0 sh

# Windows PowerShell
$env:ARGOS_VERSION='v0.2.0'; irm https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.ps1 | iex
```

macOS users can run Argos Desktop locally; a standalone macOS Argos Server
binary is not currently published.

After installing the matching OS/architecture binary, verify it:

```text
argos-daemon --version
```

For same-machine browser access, start it on loopback:

```text
argos-daemon --host 127.0.0.1 --web --pair
```

For Desktop on another trusted LAN/private-overlay device, explicitly bind the
Server to the network:

```text
argos-daemon --host 0.0.0.0 --web --pair
```

The process prints a short-lived pairing URL. When binding a specific reachable
address it also prints an `ARGOS1` human-enterable code. Copy either complete
entry into Argos Desktop under **Machines → Connect a remote machine**. When
the host is `0.0.0.0`, replace that wildcard in the printed URL with the
Server machine's reachable LAN/private-overlay address.

## Network choices

```text
Argos Desktop ──authenticated session──> Argos Server
     │                                      │
     └── local managed daemon               └── projects, agents, data

Browser/private overlay ──HTTPS or tunnel─> Argos Server (optional)
```

For a server on the same computer, bind to loopback:

```text
argos-daemon --host 127.0.0.1 --web --pair
```

For a trusted LAN or private overlay network, explicitly bind to a reachable
interface and restrict the host firewall to that network:

```text
argos-daemon --host 0.0.0.0 --web --pair
```

On Windows, use the `.exe` form of the same commands:

```text
argos-daemon.exe --version
argos-daemon.exe --host 127.0.0.1 --web --pair
argos-daemon.exe --host 0.0.0.0 --web --pair
irm http://127.0.0.1:9527/health
```

Do not expose a daemon directly to the public internet over plain HTTP. Prefer
a private overlay network or an HTTPS reverse proxy that forwards to a
loopback-bound daemon. Network reachability is not trust: pairing still creates
the revocable client session required for privileged operations.

## Pairing

Pairing uses a short-lived, single-use token. Argos Desktop exchanges it for a
revocable session and stores the session credential using the operating system's
secure storage. The token is not a long-lived API key and should not be copied
into project files, shell history, screenshots, or issue reports.

The canonical human-enterable form is:

```text
ARGOS1 <S|P> <host[:port]> <one-time-token>
```

`S` means HTTPS and `P` means HTTP. The code and link contain the same secret
and receive identical expiry and redaction handling. The pairing entry is
consumed once. If it expires or has already been consumed, restart the server
with `--pair` and use the newly printed entry.

## What runs where?

When a remote machine is active:

- agent processes execute on the remote machine;
- project folders refer to the remote filesystem;
- server sessions, provider configuration, MCP configuration, skills, plugins,
  and database remain in the server data directory;
- closing Desktop does not stop a separately installed server;
- forgetting the machine in Desktop does not delete its remote data.

Desktop-only native actions may be unavailable for a remote or browser runtime.
Argos shows capability limitations instead of silently running those actions on
This computer.

## Manage a remote machine

From the machine selector or Server settings you can retry, rename, pair again,
edit an address, copy redacted diagnostics, and forget the local connection.
Address changes are saved only after the new endpoint proves the same persistent
environment identity. Session revocation is also offered when forgetting a
paired machine; if the server is offline, local removal still succeeds and
Argos explains that the remote session still needs revocation.

Forgetting removes the Desktop credential and cached connection metadata. It
does not uninstall Argos Server or delete projects and sessions on that host.

## Health and diagnostics

Reachability can be checked without authenticating:

```text
curl http://127.0.0.1:9527/health
```

Health only proves that an HTTP listener responded. Desktop also performs an
authenticated route verification, environment/capability handshake, protocol
compatibility check, and WebSocket event-readiness check before treating a
paired machine as usable.

Useful recovery actions:

1. Confirm the server process is running.
2. Confirm the endpoint is reachable from the Desktop machine.
3. Confirm the host/firewall/TLS configuration matches the endpoint.
4. Generate a fresh pairing URL if the session was revoked or the link expired.
5. Compare Desktop and Server versions if protocol compatibility fails.

## Updates, service, and data

The standalone server binary is versioned with the Argos release that produced
it. Follow the release notes for the matching platform asset and use the server
update/service instructions supplied by the distribution method. Back up the
server data directory before upgrades or migrations.

Each published Server asset is one self-contained executable. DuckDB and the
isolated agent worker are embedded and unpacked into a private temporary runtime
directory automatically; users do not install or keep a second executable.
Release CI copies that one file to a clean directory and verifies pairing,
authenticated Desktop transport, daemon restart and address change, revocation,
server identity replacement, and protocol-version rejection on every release
runner. The Windows ARM64 workflow provides the equivalent native-architecture
gate for that artifact.

The server data directory is controlled by the daemon's `--data-dir` option (or
its platform default). Treat it as the source of truth for remote sessions,
configuration, and projects unless a feature explicitly documents synchronization.

### Linux service operations

For an always-on Linux host, install the supplied
[`systemd` unit](../../distro/systemd/argos-daemon.service), then use:

```text
sudo systemctl enable --now argos-daemon
sudo systemctl status argos-daemon
sudo systemctl restart argos-daemon
journalctl -u argos-daemon -f
```

Before an upgrade, back up the data directory. Use `argos-daemon update` when
the installed release supports it, then restart the service. To uninstall a
manual installation, stop and disable the service, remove the installed binary
and unit, then remove the data directory only after confirming that its projects
and sessions have been backed up.

## Accessibility and language

The setup flow is keyboard-operable, uses visible text in addition to status
colors, announces connection and setup progress, and always provides a copyable
pairing link/code (a QR code is not required). Commands scroll horizontally on
narrow screens and expose copy confirmation. Argos currently ships this flow in
English; when the application adds a product localization framework, these
strings must move into that shared catalog rather than introducing a
remote-machine-only translation mechanism.
