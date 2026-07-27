import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { REMOTE_MACHINE_COMMANDS } from "@argos/shared/remoteMachineCommands";

const releaseWorkflow = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../.github/workflows/release.yml"),
  "utf8",
);

describe("remote machine release matrix", () => {
  test("only advertises platforms with an enabled daemon release job", () => {
    for (const commandSet of REMOTE_MACHINE_COMMANDS) {
      const releasePlatform = commandSet.platform === "macos" ? "darwin" : commandSet.platform;
      const hasAssetStaging = releaseWorkflow.includes(`daemon_os: ${releasePlatform}`);
      if (commandSet.available) {
        expect(hasAssetStaging).toBe(true);
      } else {
        expect(releaseWorkflow).toContain("if: false # macOS build temporarily disabled");
      }
    }
  });
});
