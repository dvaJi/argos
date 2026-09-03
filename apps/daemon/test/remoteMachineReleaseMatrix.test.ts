import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { REMOTE_MACHINE_COMMANDS } from "@argos/shared/remoteMachineCommands";

const releaseWorkflow = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../.github/workflows/release.yml"),
  "utf8",
);

describe("remote machine release matrix", () => {
  test("only advertises platforms with a standalone install path", () => {
    for (const commandSet of REMOTE_MACHINE_COMMANDS) {
      const releasePlatform = commandSet.platform === "macos" ? "darwin" : commandSet.platform;
      const hasAssetStaging = releaseWorkflow.includes(`daemon_os: ${releasePlatform}`);
      if (commandSet.available) {
        expect(hasAssetStaging).toBe(true);
      } else {
        // macOS builds are re-enabled (unsigned) and the release job stages an
        // `argos-daemon-darwin-*` artifact, but the remote-machine advert stays
        // hidden until a macOS standalone install path ships.
        expect(commandSet.platform).toBe("macos");
        expect(commandSet.unavailableReason).toBeTruthy();
      }
    }
  });

  test("runs --version before staging every staged daemon artifact", () => {
    const versionChecks = releaseWorkflow.match(/- name: Verify daemon version/g) ?? [];
    const stagedPlatforms = [...releaseWorkflow.matchAll(/daemon_os: (\w+)/g)].map((match) => match[1]);

    // One version check + staging block per daemon release job (windows,
    // linux, macos).
    expect(versionChecks).toHaveLength(3);
    expect(new Set(stagedPlatforms)).toEqual(new Set(["windows", "linux", "darwin"]));
    expect(releaseWorkflow).toContain("arch: [arm64]");
    expect(releaseWorkflow).toContain('argos-daemon.exe" --version');
    expect(releaseWorkflow).toContain("apps/daemon/dist/argos-daemon --version");
  });
});
