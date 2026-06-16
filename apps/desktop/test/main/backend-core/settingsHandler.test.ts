import { describe, it, expect, vi } from "vitest";
import { SettingsRouteHandler } from "@argos/backend-core/dispatch/settings/settingsHandler";

function createMockAdapter() {
  return {
    readSnapshot: vi.fn<(...args: any[]) => any>().mockReturnValue({
      fontSizeLevel: 1,
      fontFamily: "",
      codeFontFamily: "",
      artifactsEffectEnabled: false,
      autoScrollEnabled: true,
      autoCompactionEnabled: false,
      autoCompactionTriggerThreshold: 80,
      autoCompactionRetainRecentPairs: 2,
      contentProtectionEnabled: false,
      privacyModeEnabled: false,
      notificationsEnabled: true,
      launchAtLoginEnabled: false,
      traceDebugEnabled: false,
      copyWithCotEnabled: false,
      loggingEnabled: false,
    }),
    applyChange: vi.fn<(...args: any[]) => any>(),
    listSystemFonts: vi.fn<(...args: any[]) => any>().mockResolvedValue(["Arial", "Helvetica"]),
  };
}

describe("SettingsRouteHandler", () => {
  it("gets snapshot with specific keys", () => {
    const adapter = createMockAdapter();
    const handler = new SettingsRouteHandler(adapter);

    const result = handler.getSnapshot({ keys: ["autoScrollEnabled"] });
    expect(result).toHaveProperty("values");
    expect(adapter.readSnapshot).toHaveBeenCalled();
  });

  it("gets snapshot with all keys", () => {
    const adapter = createMockAdapter();
    const handler = new SettingsRouteHandler(adapter);

    const result = handler.getSnapshot({});
    expect(result).toHaveProperty("values");
  });

  it("applies changes", () => {
    const adapter = createMockAdapter();
    const handler = new SettingsRouteHandler(adapter);

    const result = handler.update({
      changes: [{ key: "autoScrollEnabled", value: false }],
    });
    expect(adapter.applyChange).toHaveBeenCalledWith({ key: "autoScrollEnabled", value: false });
    expect(result).toHaveProperty("changedKeys");
  });

  it("lists system fonts", async () => {
    const adapter = createMockAdapter();
    const handler = new SettingsRouteHandler(adapter);

    const result = await handler.listSystemFonts({});
    expect(result).toHaveProperty("fonts");
    expect(result.fonts).toEqual(["Arial", "Helvetica"]);
  });
});
