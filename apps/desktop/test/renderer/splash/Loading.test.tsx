import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../../../src/renderer/src/assets/argos-mark.svg", () => ({
  default: "argos-mark.svg",
}));

import Loading from "../../../src/renderer/splash/Loading";
import { DATABASE_UNLOCK_REQUEST_CHANNEL } from "@shared/contracts/databaseSecurity";

type IpcListener = (event: unknown, payload: unknown) => void;

const ipcListeners = new Map<string, Set<IpcListener>>();

function bindIpcCapture(ipcRenderer: {
  on: (channel: string, listener: IpcListener) => void;
  removeListener?: (channel: string, listener: IpcListener) => void;
}) {
  const originalOn = ipcRenderer.on;
  const originalRemove = ipcRenderer.removeListener;
  ipcRenderer.on = (channel: string, listener: IpcListener) => {
    if (!ipcListeners.has(channel)) {
      ipcListeners.set(channel, new Set());
    }
    ipcListeners.get(channel)!.add(listener);
  };
  if (originalRemove) {
    ipcRenderer.removeListener = (channel: string, listener: IpcListener) => {
      ipcListeners.get(channel)?.delete(listener);
    };
  }
  return () => {
    ipcRenderer.on = originalOn;
    if (originalRemove) {
      ipcRenderer.removeListener = originalRemove;
    }
  };
}

function emit(channel: string, payload: unknown) {
  ipcListeners.get(channel)?.forEach((listener) => listener({}, payload));
}

function setupElectronMock() {
  ipcListeners.clear();
  const electron = (window as any).electron as { ipcRenderer: any };
  return bindIpcCapture(electron.ipcRenderer);
}

describe("Loading (splash)", () => {
  beforeEach(() => {
    setupElectronMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the splash shell with brand mark, wordmark, hairline arc, and no legacy loader-letter nodes", () => {
    const { container } = render(<Loading />);
    const shell = container.querySelector(".splash-shell");
    expect(shell).toBeTruthy();

    expect(screen.getByTestId("splash-brand-mark")).toBeTruthy();
    expect(screen.getByText(/^Argos$/)).toBeTruthy();
    expect(screen.getByTestId("splash-arc")).toBeTruthy();

    expect(container.querySelector(".loader-letter")).toBeNull();
    expect(container.querySelector(".loader")).toBeNull();
    expect(container.querySelector(".status-breathe")).toBeNull();
  });

  it("renders 3 status rows when a splash-update event fires with 3 activities", () => {
    const { container } = render(<Loading />);
    act(() => {
      emit("splash-update", {
        activities: [
          { key: "k1", name: "presenter-initialization", status: "running" },
          { key: "k2", name: "event-listener-setup", status: "completed" },
          { key: "k3", name: "database-initialization", status: "failed" },
        ],
      });
    });
    const list = screen.getByTestId("splash-status");
    const rows = within(list).getAllByText(/./);
    expect(rows.length).toBe(3);
    expect(container.querySelectorAll(".splash-status__row--active").length).toBe(1);
    expect(container.querySelectorAll(".splash-status__row--done").length).toBe(1);
    expect(container.querySelectorAll(".splash-status__row--failed").length).toBe(1);
  });

  it("advances the hairline arc to 100% when all 3 activities are completed", () => {
    render(<Loading />);
    act(() => {
      emit("splash-update", {
        activities: [
          { key: "k1", name: "presenter-initialization", status: "completed" },
          { key: "k2", name: "event-listener-setup", status: "completed" },
          { key: "k3", name: "database-initialization", status: "completed" },
        ],
      });
    });
    const arc = screen.getByTestId("splash-arc");
    const fill = arc.querySelector(".splash-arc__fill") as HTMLElement;
    const head = arc.querySelector(".splash-arc__head") as HTMLElement;
    expect(fill.style.width).toBe("100%");
    expect(head.style.left).toBe("100%");
  });

  it("mounts the unlock panel when a DATABASE_UNLOCK_REQUEST_CHANNEL event fires", () => {
    render(<Loading />);
    act(() => {
      emit(DATABASE_UNLOCK_REQUEST_CHANNEL, {
        requestId: "req-1",
        reason: "manual-required",
        safeStorageAvailable: true,
      });
    });
    const panel = screen.getByTestId("splash-unlock-panel");
    expect(panel).toBeTruthy();
    expect(panel.querySelector('input[type="password"]')).toBeTruthy();
    expect(panel.textContent ?? "").toContain("Local database is encrypted");
  });

  it("sends DATABASE_UNLOCK_SUBMIT_CHANNEL with the typed password", () => {
    setupElectronMock();
    const send = (window as any).electron.ipcRenderer.send as ReturnType<typeof vi.fn>;
    send.mockClear();
    render(<Loading />);
    act(() => {
      emit(DATABASE_UNLOCK_REQUEST_CHANNEL, {
        requestId: "req-2",
        reason: "manual-required",
        safeStorageAvailable: true,
      });
    });
    const input = screen.getByTestId("splash-unlock-panel").querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "open-sesame" } });
    fireEvent.submit(screen.getByTestId("splash-unlock-panel"));
    expect(send).toHaveBeenCalledWith("database-security:unlock-submit", {
      requestId: "req-2",
      password: "open-sesame",
    });
  });

  it("uses dark splash tokens by default and switches to light tokens when prefers-color-scheme: light is set", () => {
    const matchMedia = vi.fn<(...args: any[]) => MediaQueryList>().mockImplementation((query: string) => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      } as unknown as MediaQueryList;
    });
    Object.defineProperty(window, "matchMedia", { value: matchMedia, writable: true, configurable: true });

    const { unmount } = render(<Loading />);
    const shell = document.querySelector(".splash-shell") as HTMLElement;
    expect(getComputedStyle(shell).backgroundColor).not.toBe("");

    matchMedia.mockImplementation((query: string) => {
      return {
        matches: query.includes("light"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      } as unknown as MediaQueryList;
    });
    unmount();
    render(<Loading />);
    const shellAfter = document.querySelector(".splash-shell") as HTMLElement;
    expect(getComputedStyle(shellAfter).backgroundColor).not.toBe("");
  });
});
