import { createHash } from "node:crypto";
import { chmodSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { resolveDaemonVersion } from "./version";

const REPO = "dvaJi/argos";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const RELEASE_BASE = `https://github.com/${REPO}/releases/download`;
const CHECK_TIMEOUT_MS = 6000;

export type UpdateCheckResult = {
  current: string;
  latest: string;
  hasUpdate: boolean;
  htmlUrl: string;
};

type ReleaseLatest = { tag_name?: string; html_url?: string; prerelease?: boolean };

/**
 * Resolve the latest non-prerelease release tag.
 * Returns null on any network/API error so callers can stay silent.
 */
export async function checkForUpdate(currentVersion?: string, token?: string): Promise<UpdateCheckResult | null> {
  const current = currentVersion ?? resolveDaemonVersion();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "argos-daemon",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}/releases/latest`, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as ReleaseLatest;
    const tag = String(data.tag_name || "").replace(/^v/, "");
    if (!tag) return null;
    return {
      current,
      latest: tag,
      hasUpdate: tag !== current,
      htmlUrl: String(data.html_url || `https://github.com/${REPO}/releases`),
    };
  } catch {
    return null;
  }
}

/** Map the current process to a release asset + installed binary name. */
export function detectAsset(): { asset: string; binary: string } {
  const os = process.platform === "win32" ? "windows" : process.platform; // darwin | linux | windows
  const arch = process.arch; // x64 | arm64
  const ext = process.platform === "win32" ? ".exe" : "";
  return {
    asset: `argos-daemon-${os}-${arch}${ext}`,
    binary: `argos-daemon${ext}`,
  };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Replace the binary at `target` with the staged `tmp` file.
 * POSIX: renaming over a running binary is safe (old inode is kept).
 * Windows: a running .exe cannot be overwritten, but it can be renamed;
 * move the locked target aside to `<target>.old` first.
 */
function replaceBinary(tmpPath: string, target: string): void {
  if (process.platform !== "win32") {
    renameSync(tmpPath, target);
    return;
  }
  try {
    renameSync(tmpPath, target);
    return;
  } catch {
    // fall through to the rename-aside path
  }
  const oldPath = `${target}.old`;
  try {
    renameSync(target, oldPath);
  } catch {
    throw new Error(`Cannot replace ${target}. Stop the daemon, then re-run \`argos-daemon update\`.`);
  }
  renameSync(tmpPath, target);
  console.log(`Old binary moved to ${oldPath}. You may delete it after restarting.`);
}

export type SelfUpdateOptions = {
  installDir?: string;
  token?: string;
};

/**
 * Check for a newer release and, if available, download + verify + atomically
 * replace the running binary. No restart is performed — the caller/operator
 * restarts the daemon (e.g. `systemctl restart argos-daemon`).
 */
export async function runSelfUpdate(opts: SelfUpdateOptions = {}): Promise<void> {
  const current = resolveDaemonVersion();
  const check = await checkForUpdate(current, opts.token);
  if (!check) {
    console.error("Could not determine the latest release (network error or rate limited). Try again later.");
    process.exit(1);
  }
  if (!check.hasUpdate) {
    console.log(`Already up to date (v${current}).`);
    return;
  }

  const { asset, binary } = detectAsset();
  console.log(`Updating v${current} -> v${check.latest} (${asset})...`);

  const baseUrl = `${RELEASE_BASE}/v${check.latest}`;
  let buf: Buffer;
  try {
    buf = await fetchBuffer(`${baseUrl}/${asset}`);
  } catch (e) {
    console.error((e as Error).message);
    console.error(`Asset missing for this platform? See ${check.htmlUrl}`);
    process.exit(1);
  }

  // verify sha256 against the published sidecar
  try {
    const shaRes = await fetch(`${baseUrl}/${asset}.sha256`);
    if (!shaRes.ok) throw new Error(`no checksum (${shaRes.status})`);
    const expected = (await shaRes.text()).trim().split(/\s+/)[0]?.toLowerCase();
    const actual = createHash("sha256").update(buf).digest("hex");
    if (!expected || expected !== actual) {
      console.error(`Checksum mismatch.\n  expected: ${expected}\n  actual:   ${actual}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Could not verify checksum: ${(e as Error).message}. Aborting.`);
    process.exit(1);
  }

  const target = opts.installDir ? join(opts.installDir, binary) : process.execPath;
  const dir = opts.installDir ?? dirname(target);
  const tmpPath = join(dir, `.${binary}.update.${process.pid}.tmp`);

  await Bun.write(tmpPath, buf);
  try {
    chmodSync(tmpPath, 0o755);
  } catch {
    // chmod may fail on some filesystems; the rename target usually inherits acceptable bits
  }

  try {
    replaceBinary(tmpPath, target);
  } catch (e) {
    console.error((e as Error).message);
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      /* ignore cleanup */
    }
    process.exit(1);
  }

  console.log(`Updated to v${check.latest} at ${target}.`);
  console.log("Restart the daemon to apply. Under systemd:");
  console.log("  sudo systemctl restart argos-daemon");
}
