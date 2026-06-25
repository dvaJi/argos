import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLOATING_BUTTON_EVENTS } from "../../../../src/main/events";
import {
  getCollapsedWidgetSize,
  getExpandedWidgetSize,
} from "../../../../src/main/presenter/floatingButtonPresenter/layout";
import type { SessionWithState } from "@shared/types/agent-interface";

const {
  electronState,
  floatingWindowState,
  presenterState,
  sendToRendererMock,
  menuPopupMock,
  getAgentsMock,
  getSessionListMock,
} = vi.hoisted(() => {
  const eventHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const workArea = {
    x: 0,
    y: 0,
    width: 1200,
    height: 900,
  };

  const floatingWindowState = {
    bounds: { x: 1136, y: 180, width: 64, height: 64 },
    dockSide: "right" as "left" | "right",
    opacity: 1,
    exists: true,
    instance: null as null | {
      create: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      exists: ReturnType<typeof vi.fn>;
      getState: ReturnType<typeof vi.fn>;
      getBounds: ReturnType<typeof vi.fn>;
      setBounds: ReturnType<typeof vi.fn>;
      setOpacity: ReturnType<typeof vi.fn>;
      getDockSide: ReturnType<typeof vi.fn>;
      setDockSide: ReturnType<typeof vi.fn>;
      getWindow: ReturnType<typeof vi.fn>;
    },
    reset() {
      this.bounds = { x: 1136, y: 180, width: 64, height: 64 };
      this.dockSide = "right";
      this.opacity = 1;
      this.exists = true;
      this.instance = null;
    },
  };

  const presenterState = {
    sessions: [] as SessionWithState[],
    agents: [
      {
        id: "argos",
        name: "Argos",
        type: "argos" as const,
        enabled: true,
        avatar: null,
      },
      {
        id: "acp-agent",
        name: "ACP Agent",
        type: "acp" as const,
        enabled: true,
        avatar: null,
        icon: "https://example.com/acp-agent.svg",
      },
    ],
    reset() {
      this.sessions = [];
    },
  };

  const sendToRendererMock = vi.fn<(...args: any[]) => any>();
  const menuPopupMock = vi.fn<(...args: any[]) => any>();
  const getAgentsMock = vi.fn<(...args: any[]) => any>(async () => presenterState.agents);
  const getSessionListMock = vi.fn<(...args: any[]) => any>(async () => presenterState.sessions);

  return {
    electronState: {
      workArea,
      eventHandlers,
      invokeHandlers,
      reset() {
        eventHandlers.clear();
        invokeHandlers.clear();
      },
    },
    floatingWindowState,
    presenterState,
    sendToRendererMock,
    menuPopupMock,
    getAgentsMock,
    getSessionListMock,
  };
});

const BrowserWindow = vi.hoisted(() => class BrowserWindow {});

vi.mock("electron", () => ({
  BrowserWindow,
  ipcMain: {
    on: vi.fn<(...args: any[]) => any>((channel: string, handler: (...args: unknown[]) => unknown) => {
      electronState.eventHandlers.set(channel, handler);
    }),
    handle: vi.fn<(...args: any[]) => any>((channel: string, handler: (...args: unknown[]) => unknown) => {
      electronState.invokeHandlers.set(channel, handler);
    }),
    removeHandler: vi.fn<(...args: any[]) => any>((channel: string) => {
      electronState.invokeHandlers.delete(channel);
    }),
    removeAllListeners: vi.fn<(...args: any[]) => any>((channel: string) => {
      electronState.eventHandlers.delete(channel);
    }),
  },
  screen: {
    getDisplayMatching: vi.fn<(...args: any[]) => any>(() => ({
      workArea: electronState.workArea,
    })),
  },
  Menu: {
    buildFromTemplate: vi.fn<(...args: any[]) => any>(() => ({
      popup: menuPopupMock,
    })),
  },
  app: {
    quit: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("../../../../src/main/presenter/floatingButtonPresenter/FloatingButtonWindow", () => ({
  FloatingButtonWindow: class MockFloatingButtonWindow {
    public create = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    public show = vi.fn<(...args: any[]) => any>();
    public destroy = vi.fn<(...args: any[]) => any>();
    public exists = vi.fn<(...args: any[]) => any>(() => floatingWindowState.exists);
    public getState = vi.fn<(...args: any[]) => any>(() => null);
    public getBounds = vi.fn<(...args: any[]) => any>(() => ({ ...floatingWindowState.bounds }));
    public setBounds = vi.fn<(...args: any[]) => any>((bounds) => {
      floatingWindowState.bounds = { ...bounds };
    });
    public setOpacity = vi.fn<(...args: any[]) => any>((opacity: number) => {
      floatingWindowState.opacity = opacity;
    });
    public getDockSide = vi.fn<(...args: any[]) => any>(() => floatingWindowState.dockSide);
    public setDockSide = vi.fn<(...args: any[]) => any>((dockSide: "left" | "right") => {
      floatingWindowState.dockSide = dockSide;
    });
    public getWindow = vi.fn<(...args: any[]) => any>(() => ({
      isDestroyed: () => false,
      webContents: {
        id: 1,
        send: sendToRendererMock,
      },
    }));

    constructor() {
      floatingWindowState.instance = this as unknown as typeof floatingWindowState.instance;
    }
  },
}));

vi.mock("../../../../src/main/presenter/index", () => ({
  presenter: {
    agentSessionPresenter: {
      getAgents: getAgentsMock,
      getSessionList: getSessionListMock,
      activateSession: vi.fn<(...args: any[]) => any>(),
    },
    windowPresenter: {
      mainWindow: null,
      getAllWindows: vi.fn<(...args: any[]) => any>(() => []),
      getFocusedWindow: vi.fn<(...args: any[]) => any>(() => null),
      createAppWindow: vi.fn<(...args: any[]) => any>(async () => null),
      show: vi.fn<(...args: any[]) => any>(),
    },
    tabPresenter: {
      getWindowType: vi.fn<(...args: any[]) => any>(() => "chat"),
    },
  },
}));

import { FloatingButtonPresenter } from "../../../../src/main/presenter/floatingButtonPresenter";

describe("FloatingButtonPresenter drag layout sync", () => {
  let floatingPresenter: FloatingButtonPresenter | null = null;

  const createConfigPresenter = () =>
    ({
      getFloatingButtonEnabled: vi.fn<(...args: any[]) => any>(() => true),
      getLanguage: vi.fn<(...args: any[]) => any>(() => "zh-CN"),
      getCurrentThemeIsDark: vi.fn<(...args: any[]) => any>(async () => false),
      getFloatingButtonBounds: vi.fn<(...args: any[]) => any>(() => null),
      setFloatingButtonBounds: vi.fn<(...args: any[]) => any>(),
    }) as any;

  const emitEvent = async (channel: string, payload?: unknown) => {
    const handler = electronState.eventHandlers.get(channel);
    if (!handler) {
      throw new Error(`Missing IPC handler for ${channel}`);
    }

    return await handler({}, payload);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    electronState.reset();
    floatingWindowState.reset();
    presenterState.reset();
    sendToRendererMock.mockReset();
    menuPopupMock.mockReset();
    getAgentsMock.mockClear();
    getSessionListMock.mockClear();
  });

  afterEach(async () => {
    floatingPresenter?.destroy();
    floatingPresenter = null;
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("keeps the collapsed size stable when dragging interrupts collapse animation", async () => {
    floatingPresenter = new FloatingButtonPresenter(createConfigPresenter());
    await floatingPresenter.initialize();

    expect(floatingWindowState.bounds).toMatchObject({
      x: electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width / 2,
      y: 180,
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });
    expect(floatingWindowState.opacity).toBe(0.5);

    await emitEvent(FLOATING_BUTTON_EVENTS.SET_EXPANDED, true);
    await vi.advanceTimersByTimeAsync(400);

    await emitEvent(FLOATING_BUTTON_EVENTS.SET_EXPANDED, false);
    await vi.advanceTimersByTimeAsync(160);

    expect(floatingWindowState.bounds.width).toBeGreaterThan(getCollapsedWidgetSize(0).width);

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_START, { x: 100, y: 100 });
    expect(floatingWindowState.bounds).toMatchObject({
      x: electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width,
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });
    expect(floatingWindowState.opacity).toBe(1);

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_MOVE, { x: 220, y: 150 });
    expect(floatingWindowState.bounds).toMatchObject({
      x: 1270,
      y: 230,
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_END);
    expect(floatingWindowState.bounds).toMatchObject({
      x: electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width / 2,
      y: 230,
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });
    expect(floatingWindowState.opacity).toBe(0.5);
  });

  it("restores the persisted resting position on initialization", async () => {
    const configPresenter = createConfigPresenter();
    floatingPresenter = new FloatingButtonPresenter(configPresenter);
    await floatingPresenter.initialize();

    expect(configPresenter.getFloatingButtonBounds).toHaveBeenCalled();
  });

  it("persists the docked resting position after a drag ends", async () => {
    const configPresenter = createConfigPresenter();
    floatingPresenter = new FloatingButtonPresenter(configPresenter);
    await floatingPresenter.initialize();

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_START, { x: 100, y: 100 });
    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_MOVE, { x: 220, y: 150 });
    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_END);

    // Snapped/docked bounds (fully on-screen), not the peeked idle position.
    expect(configPresenter.setFloatingButtonBounds).toHaveBeenCalledWith({
      x: electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width,
      y: 230,
      dockSide: "right",
    });
  });

  it("loads all regular sessions without restricting the agent id", async () => {
    floatingPresenter = new FloatingButtonPresenter(createConfigPresenter());
    await floatingPresenter.initialize();

    expect(getSessionListMock).toHaveBeenCalledWith();
  });

  it("defers layout changes during drag and applies the latest snapshot after drop", async () => {
    floatingPresenter = new FloatingButtonPresenter(createConfigPresenter());
    await floatingPresenter.initialize();

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_START, { x: 80, y: 90 });

    await emitEvent(FLOATING_BUTTON_EVENTS.SET_EXPANDED, true);
    presenterState.sessions = [
      {
        id: "session-1",
        agentId: "argos",
        title: "Session 1",
        projectDir: null,
        isPinned: false,
        isDraft: false,
        createdAt: 1,
        updatedAt: 10,
        status: "idle",
        providerId: "openai",
        modelId: "gpt-5.4",
      },
      {
        id: "session-2",
        agentId: "argos",
        title: "Session 2",
        projectDir: null,
        isPinned: false,
        isDraft: false,
        createdAt: 2,
        updatedAt: 11,
        status: "generating",
        providerId: "openai",
        modelId: "gpt-5.4",
      },
    ];

    await floatingPresenter.refreshWidgetState();
    expect(floatingWindowState.bounds).toMatchObject({
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });

    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_MOVE, { x: 140, y: 170 });
    await emitEvent(FLOATING_BUTTON_EVENTS.DRAG_END);

    expect(floatingWindowState.bounds).toMatchObject({
      x: electronState.workArea.x + electronState.workArea.width - getExpandedWidgetSize(2).width,
      y: 260,
      width: getExpandedWidgetSize(2).width,
      height: getExpandedWidgetSize(2).height,
    });
  });

  it("reveals the collapsed widget on hover and peeks it again on mouse leave", async () => {
    floatingPresenter = new FloatingButtonPresenter(createConfigPresenter());
    await floatingPresenter.initialize();

    expect(floatingWindowState.bounds.x).toBe(
      electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width / 2,
    );
    expect(floatingWindowState.opacity).toBe(0.5);

    await emitEvent(FLOATING_BUTTON_EVENTS.HOVER_STATE_CHANGED, true);
    await vi.advanceTimersByTimeAsync(400);

    expect(floatingWindowState.bounds.x).toBe(
      electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width,
    );
    expect(floatingWindowState.opacity).toBe(1);

    await emitEvent(FLOATING_BUTTON_EVENTS.HOVER_STATE_CHANGED, false);
    await vi.advanceTimersByTimeAsync(400);

    expect(floatingWindowState.bounds.x).toBe(
      electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width / 2,
    );
    expect(floatingWindowState.opacity).toBe(0.5);
  });

  it("finishes the close animation before applying the idle peek state", async () => {
    floatingPresenter = new FloatingButtonPresenter(createConfigPresenter());
    await floatingPresenter.initialize();

    const revealedX = electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width;
    const peekedX = electronState.workArea.x + electronState.workArea.width - getCollapsedWidgetSize(0).width / 2;

    await emitEvent(FLOATING_BUTTON_EVENTS.HOVER_STATE_CHANGED, true);
    await vi.advanceTimersByTimeAsync(400);

    await emitEvent(FLOATING_BUTTON_EVENTS.SET_EXPANDED, true);
    await vi.advanceTimersByTimeAsync(400);

    await emitEvent(FLOATING_BUTTON_EVENTS.SET_EXPANDED, false);
    await vi.advanceTimersByTimeAsync(140);
    await emitEvent(FLOATING_BUTTON_EVENTS.HOVER_STATE_CHANGED, false);
    await vi.advanceTimersByTimeAsync(260);

    expect(floatingWindowState.bounds).toMatchObject({
      x: revealedX,
      y: 180,
      width: getCollapsedWidgetSize(0).width,
      height: getCollapsedWidgetSize(0).height,
    });
    expect(floatingWindowState.opacity).toBe(1);

    await vi.advanceTimersByTimeAsync(200);

    expect(floatingWindowState.bounds.x).toBeGreaterThan(revealedX);
    expect(floatingWindowState.bounds.x).toBeLessThan(peekedX);
    expect(floatingWindowState.opacity).toBe(0.5);

    await vi.advanceTimersByTimeAsync(240);

    expect(floatingWindowState.bounds.x).toBe(peekedX);
    expect(floatingWindowState.opacity).toBe(0.5);
  });
});
