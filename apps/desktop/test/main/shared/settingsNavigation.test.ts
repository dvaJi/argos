import { describe, expect, it } from "vitest";
import {
  getSettingsNavigationGroups,
  getSettingsNavigationItems,
  getSettingsRouteItems,
  resolveSettingsNavigationPath,
} from "@argos/shared/settingsNavigation";

describe("settings navigation helpers", () => {
  it("resolves direct settings routes", () => {
    expect(resolveSettingsNavigationPath("settings-overview")).toBe("/overview");
    expect(resolveSettingsNavigationPath("settings-mcp")).toBe("/mcp");
  });

  it("groups visible settings navigation and hides the legacy dashboard item", () => {
    expect(getSettingsRouteItems().some((item) => item.routeName === "settings-dashboard")).toBe(true);
    expect(getSettingsNavigationItems().some((item) => item.routeName === "settings-dashboard")).toBe(false);
    expect(getSettingsNavigationGroups()[0]?.key).toBe("overview");
  });

  it("resolves provider routes with params", () => {
    expect(
      resolveSettingsNavigationPath("settings-provider", {
        providerId: "openai",
      }),
    ).toBe("/provider/openai");
  });

  it("resolves optional provider params without a provider id", () => {
    expect(resolveSettingsNavigationPath("settings-provider")).toBe("/provider");
  });

  it("shows plugin settings navigation on supported targets and hides it on unsupported arches", () => {
    expect(getSettingsNavigationItems("darwin", "arm64").some((item) => item.routeName === "settings-plugins")).toBe(
      true,
    );
    expect(getSettingsNavigationItems("win32", "x64").some((item) => item.routeName === "settings-plugins")).toBe(true);
    expect(getSettingsNavigationItems("linux", "x64").some((item) => item.routeName === "settings-plugins")).toBe(true);
    expect(getSettingsNavigationItems("win32", "ia32").some((item) => item.routeName === "settings-plugins")).toBe(
      false,
    );
    expect(resolveSettingsNavigationPath("settings-plugins", undefined, "win32", "x64")).toBe("/plugins");
    expect(resolveSettingsNavigationPath("settings-plugins", undefined, "win32", "ia32")).toBe("/overview");
  });

  it("still filters by platform when arch is not provided (legacy call sites)", () => {
    // Supported platform, no arch -> visible (matches a target's platform prefix).
    expect(getSettingsNavigationItems("win32").some((item) => item.routeName === "settings-plugins")).toBe(true);
    // Unsupported platform, no arch -> hidden.
    expect(getSettingsNavigationItems("freebsd").some((item) => item.routeName === "settings-plugins")).toBe(false);
  });
});
