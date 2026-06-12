import type { DeepchatBridge } from "@shared/contracts/bridge";
import type { DeepchatEventName, DeepchatEventPayload } from "@shared/contracts/events";
import type { DeepchatRouteInput, DeepchatRouteName, DeepchatRouteOutput } from "@shared/contracts/routes";
import { hasDeepchatRouteContract, getDeepchatRouteContract } from "@shared/contracts/routes";
import { hasDeepchatEventContract, getDeepchatEventContract } from "@shared/contracts/events";

const TIER3_PREFIXES = [
  "window.",
  "browser.",
  "tab.",
  "dialog.",
  "upgrade.",
  "system.openSettings",
  "settings.listSystemFonts",
  "device.selectDirectory",
  "device.restartApp",
  "project.openDirectory",
  "project.selectDirectory",
  "file.saveImage",
  "file.copyImage",
  "workspace.revealFileInFolder",
  "workspace.openFile",
  "skills.openFolder",
  "sync.openFolder",
];

const TIER3_EVENT_PREFIXES = ["window.", "browser.", "dialog.", "upgrade."];

function isDesktopOnlyRoute(route: string): boolean {
  return TIER3_PREFIXES.some((prefix) => route === prefix || route.startsWith(prefix));
}

function isDesktopOnlyEvent(eventName: string): boolean {
  return TIER3_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix));
}

type EventListener<T = unknown> = (payload: T) => void;

export class HybridBridge implements DeepchatBridge {
  private wsBridge: WebSocketBridgeAdapter | null = null;
  private ipcBridge: DeepchatBridge;
  private eventListeners = new Map<string, Set<EventListener>>();
  private unsubscribeFns = new Map<string, () => void>();

  constructor(ipcBridge: DeepchatBridge) {
    this.ipcBridge = ipcBridge;
  }

  setWsBridge(wsBridge: WebSocketBridgeAdapter): void {
    this.wsBridge = wsBridge;

    for (const [eventName, listeners] of this.eventListeners) {
      this.resubscribeEvent(eventName, listeners);
    }
  }

  async invoke<T extends DeepchatRouteName>(
    routeName: T,
    input: DeepchatRouteInput<T>,
  ): Promise<DeepchatRouteOutput<T>> {
    if (isDesktopOnlyRoute(routeName)) {
      return this.ipcBridge.invoke(routeName, input);
    }

    if (this.wsBridge?.isConnected()) {
      try {
        return await this.wsBridge.invoke(routeName, input);
      } catch (error) {
        console.warn(`[HybridBridge] WS invoke failed for ${routeName}, falling back to IPC:`, error);
        return this.ipcBridge.invoke(routeName, input);
      }
    }

    return this.ipcBridge.invoke(routeName, input);
  }

  on<T extends DeepchatEventName>(eventName: T, listener: EventListener<DeepchatEventPayload<T>>): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener as EventListener);

    if (isDesktopOnlyEvent(eventName)) {
      return this.ipcBridge.on(eventName, listener);
    }

    if (this.wsBridge?.isConnected()) {
      this.resubscribeEvent(eventName, this.eventListeners.get(eventName)!);
    } else {
      return this.ipcBridge.on(eventName, listener);
    }

    return () => {
      this.eventListeners.get(eventName)?.delete(listener as EventListener);
      if (this.eventListeners.get(eventName)?.size === 0) {
        this.eventListeners.delete(eventName);
        const unsub = this.unsubscribeFns.get(eventName);
        if (unsub) {
          unsub();
          this.unsubscribeFns.delete(eventName);
        }
      }
    };
  }

  private resubscribeEvent(eventName: string, listeners: Set<EventListener>): void {
    const existingUnsub = this.unsubscribeFns.get(eventName);
    if (existingUnsub) {
      existingUnsub();
    }

    if (this.wsBridge?.isConnected()) {
      const unsub = this.wsBridge.on(eventName as any, (payload: any) => {
        for (const listener of listeners) {
          try {
            listener(payload);
          } catch (error) {
            console.error(`[HybridBridge] Event listener error for ${eventName}:`, error);
          }
        }
      });
      this.unsubscribeFns.set(eventName, unsub);
    }
  }
}

export class WebSocketBridgeAdapter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private pendingMessages: string[] = [];
  private requestCallbacks = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private eventListeners = new Map<string, Set<EventListener>>();
  private connected = false;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token ?? "";
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;

    const wsUrl = this.token ? `${this.url}?token=${encodeURIComponent(this.token)}` : this.url;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.flushPending();
        this.resubscribeAll();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.connected = false;
        setTimeout(() => this.connect().catch(() => {}), 3000);
      };

      this.ws.onerror = () => {
        this.connected = false;
        reject(new Error("WebSocket connection failed"));
      };
    });
  }

  async invoke<T extends DeepchatRouteName>(
    routeName: T,
    input: DeepchatRouteInput<T>,
  ): Promise<DeepchatRouteOutput<T>> {
    if (!hasDeepchatRouteContract(routeName)) {
      throw new Error(`Unknown route: ${routeName}`);
    }

    const contract = getDeepchatRouteContract(routeName);
    const normalizedInput = contract.input.parse(input);

    const requestId = crypto.randomUUID();
    const message = JSON.stringify({
      type: "route",
      route: routeName,
      input: normalizedInput,
      requestId,
    });

    return new Promise((resolve, reject) => {
      this.requestCallbacks.set(requestId, {
        resolve: (data: any) => {
          const output = contract.output.parse(data.output);
          resolve(output as DeepchatRouteOutput<T>);
        },
        reject: (error: any) => reject(error),
      });

      this.sendRaw(message);

      setTimeout(() => {
        if (this.requestCallbacks.has(requestId)) {
          this.requestCallbacks.delete(requestId);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }

  on<T extends DeepchatEventName>(eventName: T, listener: EventListener<DeepchatEventPayload<T>>): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener as EventListener);

    this.sendSubscribe([...this.eventListeners.keys()]);

    return () => {
      this.eventListeners.get(eventName)?.delete(listener as EventListener);
      if (this.eventListeners.get(eventName)?.size === 0) {
        this.eventListeners.delete(eventName);
      }
      this.sendSubscribe([...this.eventListeners.keys()]);
    };
  }

  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const parsed = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));

      if (parsed.requestId && this.requestCallbacks.has(parsed.requestId)) {
        const cb = this.requestCallbacks.get(parsed.requestId)!;
        this.requestCallbacks.delete(parsed.requestId);
        if (parsed.ok) {
          cb.resolve(parsed);
        } else {
          cb.reject(new Error(parsed.error?.message ?? "Request failed"));
        }
        return;
      }

      if (parsed.type === "event" && parsed.name) {
        this.dispatchEvent(parsed.name, parsed.payload);
      }
    } catch {
      // ignore malformed
    }
  }

  private dispatchEvent(eventName: string, payload: unknown): void {
    if (!hasDeepchatEventContract(eventName)) return;
    const contract = getDeepchatEventContract(eventName as DeepchatEventName);
    const validated = contract.payload.parse(payload);

    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(validated);
        } catch (error) {
          console.error(`[WSBridge] Listener error for ${eventName}:`, error);
        }
      }
    }
  }

  private sendSubscribe(events: string[]): void {
    this.sendRaw(JSON.stringify({ type: "subscribe", events }));
  }

  private sendRaw(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  private flushPending(): void {
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift()!;
      this.sendRaw(msg);
    }
  }

  private resubscribeAll(): void {
    if (this.eventListeners.size > 0) {
      this.sendSubscribe([...this.eventListeners.keys()]);
    }
  }
}
