#!/bin/sh
# argos-daemon installer (macOS / Linux)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.sh | ARGOS_VERSION=v0.2.0 sh
#
# Options (env):
#   ARGOS_VERSION   Pin a release tag (e.g. v0.1.0). Default: latest release.
#   ARGOS_INSTALL_DIR  Override install directory (default: $HOME/.argos/bin).
set -eu

REPO="dvaJi/argos"
BINARY_NAME="argos-daemon"

err() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

info() {
  printf '\033[36m>\033[0m %s\n' "$*"
}

# --- detect platform -------------------------------------------------------
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW* | MSYS* | CYGWIN*)
    err "Detected Windows/Git Bash. Use the PowerShell installer instead:"
    err "  irm https://raw.githubusercontent.com/dvaJi/argos/main/distro/install/install.ps1 | iex"
    ;;
  *) err "Unsupported OS: $(uname -s)" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) err "Unsupported architecture: $(uname -m)" ;;
esac

asset="${BINARY_NAME}-${os}-${arch}"
sha_asset="${asset}.sha256"

# --- resolve version -------------------------------------------------------
if [ -n "${ARGOS_VERSION:-}" ]; then
  tag="${ARGOS_VERSION#v}"
  version_label="${ARGOS_VERSION}"
else
  info "Resolving latest release for ${REPO}..."
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$tag" ] || err "Could not resolve latest release tag."
  version_label="$tag"
fi

info "Installing ${BINARY_NAME} ${version_label} (${os}/${arch})"

# --- install dir -----------------------------------------------------------
install_dir="${ARGOS_INSTALL_DIR:-$HOME/.argos/bin}"
mkdir -p "$install_dir"

base_url="https://github.com/${REPO}/releases/download/${tag}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- download --------------------------------------------------------------
info "Downloading ${asset}..."
if ! curl -fsSL "${base_url}/${asset}" -o "${tmpdir}/${asset}"; then
  err "Download failed for ${base_url}/${asset}.
This platform may not have a published build yet (macOS builds are staged).
Check available assets: https://github.com/${REPO}/releases/tag/${tag}"
fi

# --- verify ---------------------------------------------------------------
info "Verifying checksum..."
curl -fsSL "${base_url}/${sha_asset}" -o "${tmpdir}/${sha_asset}" ||
  err "Checksum asset is unavailable for ${asset}; refusing to install."
expected=$(awk '{print $1}' "${tmpdir}/${sha_asset}" | tr -d '[:space:]')
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "${tmpdir}/${asset}" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "${tmpdir}/${asset}" | awk '{print $1}')
else
  err "Neither sha256sum nor shasum is available; cannot verify checksum."
fi
[ "$expected" = "$actual" ] || err "Checksum mismatch.
  expected: $expected
  actual:   $actual"

# --- install ---------------------------------------------------------------
install_path="${install_dir}/${BINARY_NAME}"
mv "${tmpdir}/${asset}" "$install_path"
chmod +x "$install_path"

# --- next steps ------------------------------------------------------------
printf '\033[32m\342\234\223\033[0m Installed %s\n' "$install_path"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    printf '\nAdd this line to your shell rc (~/.zshrc or ~/.bashrc):\n'
    printf '  export PATH="%s:$PATH"\n' "$install_dir"
    ;;
esac

printf '\nRun \033[1m%s --help\033[0m to get started.\n' "$BINARY_NAME"
