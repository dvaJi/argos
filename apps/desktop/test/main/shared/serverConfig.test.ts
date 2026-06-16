import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_SERVER_CONFIG,
  SERVER_CONFIG_CHANGED_EVENT,
  SERVER_CONFIG_STORAGE_KEY,
  buildRemoteWsUrl,
  notifyChanged,
  readConfig,
  subscribe,
  writeConfig,
  type ServerConfig,
} from "@shared/serverConfig";

class EventTargetStub {
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const set = this.listeners.get(event.type);
    if (!set) return true;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
    return true;
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  private listeners = new Set<(event: StorageEvent) => void>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  dispatchStorage(key: string, newValue: string | null): void {
    const event = {
      key,
      newValue,
      oldValue: null,
      storageArea: this,
      url: window.location.href,
    } as StorageEvent;
    for (const listener of this.listeners) listener(event);
  }
}

function withLocalStorage(value: Record<string, string> | null, run: () => void): void {
  const original = globalThis.localStorage;
  const originalEventTarget = (globalThis as any).addEventListener;
  const storage = new MemoryStorage();
  const eventTarget = new EventTargetStub();
  if (value) {
    for (const [k, v] of Object.entries(value)) storage.setItem(k, v);
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  (globalThis as any).addEventListener = eventTarget.addEventListener.bind(eventTarget);
  (globalThis as any).removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  (globalThis as any).dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: original,
      configurable: true,
      writable: true,
    });
    if (originalEventTarget) {
      (globalThis as any).addEventListener = originalEventTarget;
    } else {
      delete (globalThis as any).addEventListener;
    }
  }
}

describe("serverConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns DEFAULT_SERVER_CONFIG when localStorage is empty", () => {
    withLocalStorage(null, () => {
      expect(readConfig()).toEqual(DEFAULT_SERVER_CONFIG);
    });
  });

  it("returns DEFAULT_SERVER_CONFIG when stored value is corrupted", () => {
    withLocalStorage({ [SERVER_CONFIG_STORAGE_KEY]: "not-json" }, () => {
      expect(readConfig()).toEqual(DEFAULT_SERVER_CONFIG);
    });
  });

  it("ignores entries with the wrong shape", () => {
    withLocalStorage({ [SERVER_CONFIG_STORAGE_KEY]: JSON.stringify({ mode: "banana" }) }, () => {
      expect(readConfig()).toEqual(DEFAULT_SERVER_CONFIG);
    });
  });

  it("persists and reads a valid config", () => {
    withLocalStorage(null, () => {
      const cfg: ServerConfig = { mode: "remote", remoteUrl: "http://10.0.0.1:9527", authToken: "abc" };
      writeConfig(cfg);
      expect(readConfig()).toEqual(cfg);
    });
  });

  it("subscribe() invokes the callback when notifyChanged() is dispatched", () => {
    withLocalStorage(null, () => {
      const seen: ServerConfig[] = [];
      const unsubscribe = subscribe((cfg) => seen.push(cfg));

      notifyChanged();
      unsubscribe();
      notifyChanged();

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual(DEFAULT_SERVER_CONFIG);
    });
  });

  it("subscribe() is a no-op on the server (no window/document)", () => {
    const originalWindow = (globalThis as any).window;
    const originalLocalStorage = (globalThis as any).localStorage;
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;

    try {
      const unsubscribe = subscribe(() => {
        throw new Error("should not be called");
      });
      notifyChanged();
      expect(typeof unsubscribe).toBe("function");
    } finally {
      (globalThis as any).window = originalWindow;
      (globalThis as any).localStorage = originalLocalStorage;
    }
  });

  it("subscribe() unsubscribes cleanly", () => {
    withLocalStorage(null, () => {
      let calls = 0;
      const unsubscribe = subscribe(() => {
        calls++;
      });
      notifyChanged();
      unsubscribe();
      notifyChanged();
      expect(calls).toBe(1);
    });
  });

  it("buildRemoteWsUrl maps https to wss and strips trailing slashes", () => {
    expect(buildRemoteWsUrl("https://example.com/")).toBe("wss://example.com/api/v1/events");
    expect(buildRemoteWsUrl("http://example.com")).toBe("ws://example.com/api/v1/events");
    expect(buildRemoteWsUrl(" http://example.com/ ")).toBe("ws://example.com/api/v1/events");
  });
});

describe("serverConfig event constant", () => {
  it("exists and is a string", () => {
    expect(typeof SERVER_CONFIG_CHANGED_EVENT).toBe("string");
  });
});
