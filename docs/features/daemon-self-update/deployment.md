# Running argos-daemon on a server (systemd)

This guide covers running `argos-daemon` as a managed service on Linux and the
manual update flow. It is **prescriptive documentation**, not an installer — you
adapt paths/users to your environment.

## 1. Install the binary

Via the installer (latest release):

```bash
curl -fsSL https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/install.sh | sh
```

…or download a specific release asset from
<https://github.com/dvaJi/argos/releases>, then place it on `PATH`:

```bash
sudo install -m 0755 argos-daemon-linux-x64 /usr/local/bin/argos-daemon
```

## 2. (Recommended) Create a dedicated user + data dir

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin argos
sudo mkdir -p /opt/argos-daemon/data
sudo chown -R argos:argos /opt/argos-daemon
```

## 3. Install the service unit

A reference unit ships at
[`distro/systemd/argos-daemon.service`](../../../distro/systemd/argos-daemon.service).
Copy and adjust the `User`, `ExecStart`, and `Environment=ARGOS_DATA_DIR` to match
your layout, then:

```bash
sudo install -m 0644 distro/systemd/argos-daemon.service /etc/systemd/system/argos-daemon.service
sudo systemctl daemon-reload
sudo systemctl enable --now argos-daemon
sudo systemctl status argos-daemon
```

The unit runs the daemon bound to `127.0.0.1:9527` by default. To expose it
remotely, set `Environment=ARGOS_HOST=0.0.0.0` and `Environment=ARGOS_TOKEN=...`
in a systemd override (`systemctl edit argos-daemon`).

## 4. Updating

Updates are **manual and explicit**. The daemon never restarts itself.

```bash
# 1. Replace the binary in place (downloads + verifies sha256 + atomic swap)
sudo argos-daemon update

# 2. Restart the service so the new binary takes effect
sudo systemctl restart argos-daemon
```

If the binary is owned by root (e.g. `/usr/local/bin`), run `update` with `sudo`.
If it lives under `/opt/argos-daemon` owned by the `argos` user, run `update` as
that user (and restart via sudo/polkit as appropriate).

On startup the daemon logs whether an update is available:

```
[daemon] Update available: v0.2.0 (current v0.1.0). Run `argos-daemon update`.
```

Disable this check on air-gapped hosts with `--no-update-check` or
`Environment=ARGOS_NO_UPDATE_CHECK=1`.

## 5. Logs

```bash
journalctl -u argos-daemon -f
```

## Notes

- On Linux, `argos-daemon update` renames the new binary over the running one; the
  running process keeps serving from the old inode until you `systemctl restart`.
- The reference unit applies common hardening (`NoNewPrivileges`, `ProtectSystem`,
  `ProtectHome`, `ReadWritePaths` limited to the data dir). Loosen
  `ReadWritePaths` if you relocate the data directory.
