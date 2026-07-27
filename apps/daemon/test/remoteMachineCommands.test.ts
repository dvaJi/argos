import { describe, expect, test } from "vitest";
import { REMOTE_MACHINE_COMMANDS, getRemoteMachineCommands } from "@argos/shared/remoteMachineCommands";

describe("remote machine command matrix", () => {
  test("covers every supported platform with version, health, and pairing commands", () => {
    expect(REMOTE_MACHINE_COMMANDS.map((entry) => entry.platform)).toEqual(["macos", "linux", "windows"]);
    for (const entry of REMOTE_MACHINE_COMMANDS) {
      if (!entry.available) continue;
      expect(entry.install).toMatch(/argos-daemon|install\.(sh|ps1)/);
      expect(entry.start.loopback).toContain("--host 127.0.0.1");
      expect(entry.start["private-network"]).toContain("--host 0.0.0.0");
      expect(entry.version).toContain("--version");
      expect(entry.health).toContain("/health");
    }
  });

  test("falls back to the Linux installer for unknown runtime detection", () => {
    expect(getRemoteMachineCommands("linux").platform).toBe("linux");
  });
});
