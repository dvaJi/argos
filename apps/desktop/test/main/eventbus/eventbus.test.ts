import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus, SendTarget } from "../../../src/main/eventbus";
import type { IWindowPresenter, ITabPresenter } from "@argos/shared/presenter";

describe("EventBus event bus", () => {
  let eventBus: EventBus;
  let mockWindowPresenter: IWindowPresenter;
  let mockTabPresenter: ITabPresenter;

  beforeEach(() => {
    eventBus = new EventBus();

    // Mock WindowPresenter
    mockWindowPresenter = {
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      sendToAllWindows: vi.fn<(...args: any[]) => any>(),
      sendToDefaultWindow: vi.fn<(...args: any[]) => any>(),
      sendToDefaultTab: vi.fn<(...args: any[]) => any>(),
      sendToWebContents: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
      sendToActiveTab: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    } as Partial<IWindowPresenter> as IWindowPresenter;

    // Mock TabPresenter
    mockTabPresenter = {
      getTab: vi.fn<(...args: any[]) => any>(),
      getActiveTabId: vi.fn<(...args: any[]) => any>(),
    } as Partial<ITabPresenter> as ITabPresenter;
  });

  describe("send event to main process", () => {
    it("should correctly send an event to the main process", () => {
      const eventName = "test:event";
      const testData = { message: "test" };

      // Listen for the event
      const mockListener = vi.fn<(...args: any[]) => any>();
      eventBus.on(eventName, mockListener);

      // Send the event
      eventBus.sendToMain(eventName, testData);

      // Verify the event was dispatched correctly
      expect(mockListener).toHaveBeenCalledWith(testData);
      expect(mockListener).toHaveBeenCalledTimes(1);
    });

    it("should support sending multiple arguments", () => {
      const eventName = "test:multiple-args";
      const arg1 = "first";
      const arg2 = { second: "data" };
      const arg3 = 123;

      const mockListener = vi.fn<(...args: any[]) => any>();
      eventBus.on(eventName, mockListener);

      eventBus.sendToMain(eventName, arg1, arg2, arg3);

      expect(mockListener).toHaveBeenCalledWith(arg1, arg2, arg3);
    });
  });

  describe("send event to a specific window", () => {
    beforeEach(() => {
      eventBus.setWindowPresenter(mockWindowPresenter);
    });

    it("should send an event to a specific window", () => {
      const eventName = "window:test";
      const windowId = 123;
      const testData = { data: "test" };

      eventBus.sendToWindow(eventName, windowId, testData);

      expect(mockWindowPresenter.sendToWindow).toHaveBeenCalledWith(windowId, eventName, testData);
    });

    it("should show a warning when WindowPresenter is not set", () => {
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const newEventBus = new EventBus();

      newEventBus.sendToWindow("test:event", 1, "data");

      expect(consoleSpy).toHaveBeenCalledWith("WindowPresenter not available, cannot send to window");

      consoleSpy.mockRestore();
    });
  });

  describe("send event to renderer process", () => {
    beforeEach(() => {
      eventBus.setWindowPresenter(mockWindowPresenter);
    });

    it("should send an event to all windows (default behavior)", () => {
      const eventName = "renderer:test";
      const testData = { message: "test" };

      eventBus.sendToRenderer(eventName, undefined, testData);

      expect(mockWindowPresenter.sendToAllWindows).toHaveBeenCalledWith(eventName, testData);
    });

    it("should send an event to all windows (explicit)", () => {
      const eventName = "renderer:all";
      const testData = { message: "all windows" };

      eventBus.sendToRenderer(eventName, SendTarget.ALL_WINDOWS, testData);

      expect(mockWindowPresenter.sendToAllWindows).toHaveBeenCalledWith(eventName, testData);
    });

    it("should send an event to the default window", () => {
      const eventName = "renderer:default-window";
      const testData = { message: "default window" };

      eventBus.sendToRenderer(eventName, SendTarget.DEFAULT_WINDOW, testData);

      expect(mockWindowPresenter.sendToDefaultWindow).toHaveBeenCalledWith(eventName, true, testData);
    });

    it("should send an event to the default tab", () => {
      const eventName = "renderer:default-tab";
      const testData = { message: "default tab" };

      eventBus.sendToRenderer(eventName, SendTarget.DEFAULT_TAB, testData);

      expect(mockWindowPresenter.sendToDefaultTab).toHaveBeenCalledWith(eventName, true, testData);
      expect(mockWindowPresenter.sendToDefaultWindow).not.toHaveBeenCalled();
    });

    it("should show a warning when WindowPresenter is not set", () => {
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const newEventBus = new EventBus();

      newEventBus.sendToRenderer("test:event", SendTarget.ALL_WINDOWS, "data");

      expect(consoleSpy).toHaveBeenCalledWith("WindowPresenter not available, cannot send to renderer");

      consoleSpy.mockRestore();
    });

    it("should silently skip optional renderer send when WindowPresenter is not set", () => {
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const newEventBus = new EventBus();

      const sent = newEventBus.sendToRendererIfAvailable("test:event", SendTarget.ALL_WINDOWS, "data");

      expect(sent).toBe(false);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should be able to send to all windows via the optional renderer send path", () => {
      const eventName = "renderer:optional";
      const testData = { message: "optional renderer" };

      const sent = eventBus.sendToRendererIfAvailable(eventName, SendTarget.ALL_WINDOWS, testData);

      expect(sent).toBe(true);
      expect(mockWindowPresenter.sendToAllWindows).toHaveBeenCalledWith(eventName, testData);
    });
  });

  describe("send to both main and renderer", () => {
    beforeEach(() => {
      eventBus.setWindowPresenter(mockWindowPresenter);
    });

    it("should send an event to both main and renderer", () => {
      const eventName = "both:test";
      const testData = { message: "both processes" };

      const mockListener = vi.fn<(...args: any[]) => any>();
      eventBus.on(eventName, mockListener);

      eventBus.send(eventName, SendTarget.ALL_WINDOWS, testData);

      // Verify main process received the event
      expect(mockListener).toHaveBeenCalledWith(testData);

      // Verify renderer process received the event
      expect(mockWindowPresenter.sendToAllWindows).toHaveBeenCalledWith(eventName, testData);
    });

    it("should use the default SendTarget", () => {
      const eventName = "both:default";
      const testData = { message: "default target" };

      eventBus.send(eventName, undefined, testData);

      expect(mockWindowPresenter.sendToAllWindows).toHaveBeenCalledWith(eventName, testData);
    });

    it("should still send to main process without warning when WindowPresenter is not set", () => {
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const newEventBus = new EventBus();
      const eventName = "both:no-renderer";
      const testData = { message: "main only" };
      const mockListener = vi.fn<(...args: any[]) => any>();
      newEventBus.on(eventName, mockListener);

      newEventBus.send(eventName, SendTarget.ALL_WINDOWS, testData);

      expect(mockListener).toHaveBeenCalledWith(testData);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("webContents routing", () => {
    beforeEach(() => {
      eventBus.setWindowPresenter(mockWindowPresenter);
      eventBus.setTabPresenter(mockTabPresenter);
      vi.mocked<(...args: any[]) => any>(mockTabPresenter.getActiveTabId).mockResolvedValue(1);
    });

    it("should send an event to a specific webContents", async () => {
      const webContentsId = 1;
      const eventName = "web-contents:test";
      const testData = { message: "webContents test" };

      eventBus.sendToWebContents(webContentsId, eventName, testData);

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockWindowPresenter.sendToWebContents).toHaveBeenCalledWith(webContentsId, eventName, testData);
    });

    it("should send an event to the active window content", async () => {
      const windowId = 1;
      const eventName = "active-content:test";
      const testData = { message: "active content test" };

      eventBus.sendToActiveTab(windowId, eventName, testData);

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockWindowPresenter.sendToActiveTab).toHaveBeenCalledWith(windowId, eventName, testData);
    });

    it("should broadcast an event to multiple webContents", async () => {
      const webContentsIds = [1, 2, 3];
      const eventName = "broadcast:test";
      const testData = { message: "broadcast test" };

      eventBus.broadcastToWebContents(webContentsIds, eventName, testData);

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockWindowPresenter.sendToWebContents).toHaveBeenCalledTimes(3);
      expect(mockWindowPresenter.sendToWebContents).toHaveBeenCalledWith(1, eventName, testData);
      expect(mockWindowPresenter.sendToWebContents).toHaveBeenCalledWith(2, eventName, testData);
      expect(mockWindowPresenter.sendToWebContents).toHaveBeenCalledWith(3, eventName, testData);
    });

    it("should show a warning when WindowPresenter is not set", () => {
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      const newEventBus = new EventBus();

      newEventBus.sendToWebContents(1, "test:event", "data");

      expect(consoleSpy).toHaveBeenCalledWith("WindowPresenter not available, cannot send to specific webContents");

      consoleSpy.mockRestore();
    });
  });

  describe("Presenter setup", () => {
    it("should be able to set the WindowPresenter", () => {
      eventBus.setWindowPresenter(mockWindowPresenter);

      // Verify setup succeeded (no warning when sending an event)
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      eventBus.sendToRenderer("test:event", SendTarget.ALL_WINDOWS, "data");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should be able to set the TabPresenter", () => {
      eventBus.setTabPresenter(mockTabPresenter);

      // Verify setup succeeded (no warning when sending an event)
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});
      eventBus.setWindowPresenter(mockWindowPresenter);
      eventBus.sendToWebContents(1, "test:event", "data");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      eventBus.setWindowPresenter(mockWindowPresenter);
    });

    it("should show a warning when the webContents no longer exists", async () => {
      vi.mocked<(...args: any[]) => any>(mockWindowPresenter.sendToWebContents).mockResolvedValue(false);
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => {});

      eventBus.sendToWebContents(999, "test:event", "data");

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith("webContents 999 not found or destroyed, cannot send event test:event");

      consoleSpy.mockRestore();
    });

    it("should log an error when sending to a webContents fails", async () => {
      const error = new Error("Failed to send webContents event");
      vi.mocked<(...args: any[]) => any>(mockWindowPresenter.sendToWebContents).mockRejectedValue(error);
      const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});

      eventBus.sendToWebContents(1, "test:event", "data");

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith("Error sending event test:event to webContents 1:", error);

      consoleSpy.mockRestore();
    });
  });
});
