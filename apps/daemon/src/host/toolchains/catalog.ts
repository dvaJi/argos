import type { ToolchainArchive } from "./types";

/**
 * Managed-install catalog. Pins carry real SHA-256 digests captured from the
 * official release artifacts:
 * - Node from https://nodejs.org/dist/<pin>/SHASUMS256.txt
 * - uv from the GitHub release artifacts for the pin.
 *
 * uv archive filenames do not embed the version, so a pin bump without fresh
 * hashes would pass compile-time checks and fail at first install — the
 * catalog tests therefore assert every pin has complete non-empty hashes.
 * ripgrep has no managed pin: the bundled seed plus system installs cover it.
 */

export const NODE_PIN = "v24.18.0";
export const UV_PIN = "0.9.18";

export const NODE_DIST_BASE = "https://nodejs.org/dist";
export const UV_RELEASE_BASE = "https://github.com/astral-sh/uv/releases/download";

type PlatformKey = string;

const NODE_ARCHIVES: Record<string, Record<PlatformKey, ToolchainArchive>> = {
  [NODE_PIN]: {
    "win32-x64": {
      filename: `node-${NODE_PIN}-win-x64.zip`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-win-x64.zip`,
      sha256: "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821",
    },
    "win32-arm64": {
      filename: `node-${NODE_PIN}-win-arm64.zip`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-win-arm64.zip`,
      sha256: "f274669adb93b1fd0fbf8f21fd078609e9dcc84333d4f2718d2dde3f9a161a01",
    },
    "darwin-arm64": {
      filename: `node-${NODE_PIN}-darwin-arm64.tar.gz`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-darwin-arm64.tar.gz`,
      sha256: "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
    },
    "darwin-x64": {
      filename: `node-${NODE_PIN}-darwin-x64.tar.gz`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-darwin-x64.tar.gz`,
      sha256: "dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080",
    },
    "linux-x64": {
      filename: `node-${NODE_PIN}-linux-x64.tar.gz`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-linux-x64.tar.gz`,
      sha256: "783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8",
    },
    "linux-arm64": {
      filename: `node-${NODE_PIN}-linux-arm64.tar.gz`,
      url: `${NODE_DIST_BASE}/${NODE_PIN}/node-${NODE_PIN}-linux-arm64.tar.gz`,
      sha256: "6b4484c2190274175df9aa8f28e2d758a819cb1c1fe6ab481e2f95b463ab8508",
    },
  },
};

const UV_ARCHIVES: Record<string, Record<PlatformKey, ToolchainArchive>> = {
  [UV_PIN]: {
    "win32-x64": {
      filename: "uv-x86_64-pc-windows-msvc.zip",
      url: `${UV_RELEASE_BASE}/${UV_PIN}/uv-x86_64-pc-windows-msvc.zip`,
      sha256: "28cbe5d30907a774bfe27a517a39b494ec6f7d3816bda8bbf6f9645490449182",
    },
    "win32-arm64": {
      filename: "uv-aarch64-pc-windows-msvc.zip",
      url: `${UV_RELEASE_BASE}/${UV_PIN}/uv-aarch64-pc-windows-msvc.zip`,
      sha256: "fadb43ba13091f44e1786fc3967e65c7786d86192aa205d718307c649927cfc2",
    },
    "darwin-arm64": {
      filename: "uv-aarch64-apple-darwin.tar.gz",
      url: `${UV_RELEASE_BASE}/${UV_PIN}/uv-aarch64-apple-darwin.tar.gz`,
      sha256: "dc3bee4abbb3bac267a3985a23ea7617d19d41ff381dbaf560ba415ad65af68f",
    },
    "linux-x64": {
      filename: "uv-x86_64-unknown-linux-gnu.tar.gz",
      url: `${UV_RELEASE_BASE}/${UV_PIN}/uv-x86_64-unknown-linux-gnu.tar.gz`,
      sha256: "c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5",
    },
    "linux-arm64": {
      filename: "uv-aarch64-unknown-linux-gnu.tar.gz",
      url: `${UV_RELEASE_BASE}/${UV_PIN}/uv-aarch64-unknown-linux-gnu.tar.gz`,
      sha256: "f8e23ec786b18660ade6b033b6191b7e9c283c872eeb8c4531d56a873decf160",
    },
  },
};

function platformArchKey(): PlatformKey {
  return `${process.platform}-${process.arch}`;
}

/** Managed archive for the current platform, or null when the tool has no pin. */
export function archiveFor(tool: "node" | "uv"): ToolchainArchive | null {
  const key = platformArchKey();
  const table = tool === "node" ? NODE_ARCHIVES[NODE_PIN] : UV_ARCHIVES[UV_PIN];
  return table?.[key] ?? null;
}

export function pinFor(tool: "node" | "uv"): string {
  return tool === "node" ? NODE_PIN : UV_PIN;
}
