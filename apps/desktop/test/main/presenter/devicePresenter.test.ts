import { describe, it, expect, vi } from "vitest";
import { DevicePresenter } from "../../../src/main/presenter/devicePresenter/index";

// Mock eventBus (imported by DevicePresenter via @/eventbus)
vi.mock("@/eventbus", () => ({
  eventBus: {
    on: vi.fn<(...args: any[]) => any>(),
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
    emit: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

// Mock svgSanitizer (imported by DevicePresenter via @/lib/svgSanitizer)
vi.mock("@/lib/svgSanitizer", () => ({
  svgSanitizer: {
    sanitize: vi.fn<(...args: any[]) => any>(),
  },
}));

describe("DevicePresenter", () => {
  describe("getDefaultHeaders", () => {
    it("should include User-Agent header with Argos/ prefix", () => {
      const headers = DevicePresenter.getDefaultHeaders();

      expect(headers).toHaveProperty("User-Agent");
      expect(headers["User-Agent"]).toMatch(/^Argos\//);
    });

    it("should include HTTP-Referer and X-Title headers", () => {
      const headers = DevicePresenter.getDefaultHeaders();

      expect(headers["HTTP-Referer"]).toBe("https://argos.aipurrjects.xyz");
      expect(headers["X-Title"]).toBe("Argos");
    });
  });
});
