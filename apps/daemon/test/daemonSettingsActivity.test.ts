import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { settingsActivityListRoute } from "@argos/shared-contracts/routes";

describe("daemon settings activity", () => {
  it("lists settings activity from the daemon database", async () => {
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [
          {
            id: "activity-1",
            category: "provider",
            action: "updated",
            target_type: "provider",
            target_id: "openai",
            target_label: "OpenAI",
            route_name: "providers.update",
            route_params_json: JSON.stringify({ providerId: "openai" }),
            summary_key: "provider.updated",
            summary_params_json: JSON.stringify({ provider: "OpenAI", enabled: true }),
            created_at: 1720000000000,
          },
        ]),
      })),
    };
    const providerImportService = {
      scan: vi.fn(async () => ({
        sessionId: "scan-session",
        sourceOrder: [],
        sources: [],
        providers: [],
      })),
      apply: vi.fn(() => ({
        summary: { imported: 0, created: 0, updated: 0, skipped: 0, overwritten: 0, models: 0 },
        results: [],
      })),
    };
    const dispatcher = createDaemonDispatcher(
      {} as any,
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
      db as any,
    );

    await expect(dispatcher(settingsActivityListRoute.name, { limit: 25 })).resolves.toEqual({
      activities: [
        expect.objectContaining({
          id: "activity-1",
          category: "provider",
          action: "updated",
          targetType: "provider",
          targetId: "openai",
          targetLabel: "OpenAI",
          routeName: "providers.update",
          routeParams: { providerId: "openai" },
          summaryKey: "provider.updated",
          summaryParams: { provider: "OpenAI", enabled: true },
          createdAt: 1720000000000,
        }),
      ],
    });
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("FROM settings_activity"));
  });
});
