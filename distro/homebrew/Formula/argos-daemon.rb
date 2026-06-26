# Homebrew formula for argos-daemon.
#
# This file is the SOURCE OF TRUTH and is published to the live tap
# (github.com/dvaJi/homebrew-tap) by `scripts/bump-tap.mjs`, which rewrites
# `version`, every `url`, and every `sha256` for the published release assets.
# Until then the sha256 values below are PLACEHOLDERS.
#
# Usage (once published):
#   brew tap dvaJi/tap
#   brew install argos-daemon
class ArgosDaemon < Formula
  desc "Argos headless backend server"
  homepage "https://github.com/dvaJi/argos"
  version "0.1.0"
  license "Apache-2.0"

  on_macos do
    on_intel do
      url "https://github.com/dvaJi/argos/releases/download/v0.1.0/argos-daemon-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_arm do
      url "https://github.com/dvaJi/argos/releases/download/v0.1.0/argos-daemon-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/dvaJi/argos/releases/download/v0.1.0/argos-daemon-linux-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_arm do
      url "https://github.com/dvaJi/argos/releases/download/v0.1.0/argos-daemon-linux-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    bin.install File.basename(stable.url) => "argos-daemon"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/argos-daemon --version")
  end
end
