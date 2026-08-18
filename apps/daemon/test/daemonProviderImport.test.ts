import { describe, expect, it, vi } from "bun:test";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { providersImportApplyRoute, providersImportScanRoute } from "@argos/shared-contracts/routes";

describe("daemon provider import", () => {
  it("delegates provider import scan and apply to the daemon service", async () => {
    const scanResult = {
      sessionId: "scan-session",
      sourceOrder: ["cc-switch"],
      sources: [],
      providers: [],
    };
    const applyResult = {
      summary: {
        imported: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        overwritten: 0,
        models: 2,
      },
      results: [],
    };
    const providerImportService = {
      scan: vi.fn(async () => scanResult),
      apply: vi.fn(() => applyResult),
    };
    const settingsActivityDb = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
      })),
    };
    const dispatcher = createDaemonDispatcher(
      { getProviders: () => [] } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { runtime: {} as any } as any,
      undefined,
      providerImportService as any,
      settingsActivityDb as any,
    );

    await expect(dispatcher(providersImportScanRoute.name, {})).resolves.toEqual(scanResult);
    await expect(
      dispatcher(providersImportApplyRoute.name, { sessionId: "scan-session", selections: [] }),
    ).resolves.toEqual(applyResult);
    expect(providerImportService.scan).toHaveBeenCalledTimes(1);
    expect(providerImportService.apply).toHaveBeenCalledTimes(1);
  });
});
