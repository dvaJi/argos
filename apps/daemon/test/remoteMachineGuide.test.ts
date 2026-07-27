import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { REMOTE_MACHINE_COMMANDS } from "@argos/shared/remoteMachineCommands";

const guide = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../docs/guides/remote-machines.md"),
  "utf8",
);

describe("remote-machine guide", () => {
  test("documents every advertised installer and safe pairing commands", () => {
    for (const commandSet of REMOTE_MACHINE_COMMANDS) {
      if (!commandSet.available) continue;
      expect(guide).toContain(commandSet.install);
      expect(guide).toContain(commandSet.start.loopback);
      expect(guide).toContain(commandSet.start["private-network"]);
      expect(guide).toContain(commandSet.version);
      expect(guide).toContain(commandSet.health);
    }
  });
});
