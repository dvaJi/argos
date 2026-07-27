import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOrCreateEnvironmentId } from "../src/host/environment-identity";

describe("loadOrCreateEnvironmentId", () => {
  it("persists one identity per data directory", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "argos-environment-"));
    const first = loadOrCreateEnvironmentId(dataDir);
    const second = loadOrCreateEnvironmentId(dataDir);

    expect(first).toBe(second);
    expect(readFileSync(join(dataDir, "environment-id"), "utf8").trim()).toBe(first);
  });

  it("repairs an empty identity file instead of returning a new ephemeral id on every start", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "argos-environment-empty-"));
    writeFileSync(join(dataDir, "environment-id"), "");

    const repaired = loadOrCreateEnvironmentId(dataDir);

    expect(repaired).toBeTruthy();
    expect(loadOrCreateEnvironmentId(dataDir)).toBe(repaired);
    expect(readFileSync(join(dataDir, "environment-id"), "utf8").trim()).toBe(repaired);
  });
});
