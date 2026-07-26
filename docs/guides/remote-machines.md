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
advanced/headless**.

After installing the matching OS/architecture binary, verify it:

```text
argos-daemon --version
```

Start it with web serving and one-time pairing enabled:

```text
argos-daemon --web --pair
```

The process prints a short-lived pairing URL. Copy the complete URL into Argos
Desktop under **Machines → Connect a remote machine**.

## Network choices

For a server on the same computer, bind to loopback:

```text
argos-daemon --host 127.0.0.1 --web --pair
```

For a trusted LAN or private overlay network, explicitly bind to a reachable
interface and restrict the host firewall to that network:

```text
argos-daemon --host 0.0.0.0 --web --pair
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

The pairing link is consumed once. If it expires or has already been consumed,
restart the server with `--pair` and use the newly printed link.

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

From the machine selector or Server settings you can:

- retry a disconnected machine;
- pair again after revocation or credential loss;
- edit an advanced endpoint;
- rename the machine;
- copy redacted diagnostics;
- forget the local connection;
- revoke the current client session when the server supports it.

Forgetting removes the Desktop credential and cached connection metadata. It
does not uninstall Argos Server or delete projects and sessions on that host.

## Health and diagnostics

Reachability can be checked without authenticating:

```text
curl http://127.0.0.1:9527/health
```

Health only proves that an HTTP listener responded. Desktop also performs an
authenticated route verification and WebSocket connection before treating a
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

The server data directory is controlled by the daemon's `--data-dir` option (or
its platform default). Treat it as the source of truth for remote sessions,
configuration, and projects unless a feature explicitly documents synchronization.

