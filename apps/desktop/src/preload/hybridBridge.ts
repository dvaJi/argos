import type { ArgosBridge } from "@shared/contracts/bridge";
import type { ArgosEventName, ArgosEventPayload } from "@shared/contracts/events";
import type { ArgosRouteInput, ArgosRouteName, ArgosRouteOutput } from "@shared/contracts/routes";
import { CONNECTION_STATE_DEFAULT, type ConnectionState } from "@shared/contracts/connection";
import {
  isDesktopOnlyRoute as isDesktopOnlyRouteShared,
  isDesktopOnlyEvent as isDesktopOnlyEventShared,
} from "@shared/contracts/desktop-only";
import { WebSocketBridge } from "@argos/client-sdk";

function isDesktopOnlyRoute(route: string): boolean {
  return isDesktopOnlyRouteShared(route);
}

function isDesktopOnlyEvent(eventName: string): boolean {
  return isDesktopOnlyEventShared(eventName);
}

type EventListener<T = unknown> = (payload: T) => void;
type ConnectionStateListener = (state: ConnectionState) => void;

export class HybridBridge implements ArgosBridge {
  private wsBridge: WebSocketBridge | null = null;
  private wsBridgeStateUnsubscribe: (() => void) | null = null;
  private pendingBridgeConnection: Promise<WebSocketBridge | null> | null = null;
  private ipcBridge: ArgosBridge;
  private eventListeners = new Map<string, Set<EventListener>>();
  private unsubscribeFns = new Map<string, () => void>();
  private connectionState: ConnectionState = { ...CONNECTION_STATE_DEFAULT };
  private connectionStateListeners = new Set<ConnectionStateListener>();

  constructor(ipcBridge: ArgosBridge) {
    this.ipcBridge = ipcBridge;
  }

  setWsBridge(wsBridge: WebSocketBridge | null, mode: ConnectionState["mode"] = "local"): void {
    if (this.wsBridgeStateUnsubscribe) {
      this.wsBridgeStateUnsubscribe();
      this.wsBridgeStateUnsubscribe = null;
    }
    if (this.wsBridge) {
      this.wsBridge.close();
    }
    this.wsBridge = wsBridge;

    if (wsBridge) {
      this.wsBridgeStateUnsubscribe = wsBridge.onConnectionStateChange((state) =>
        this.setConnectionState({
          connected: state.connected,
          lastError: state.lastError,
        }),
      );
      this.setConnectionState({
        mode,
        url: wsBridge.getUrl(),
        connected: wsBridge.isConnected(),
        lastError: null,
      });
    } else {
      this.setConnectionState({
        mode: "local",
        url: null,
        connected: false,
        lastError: null,
      });
    }

    for (const [eventName, listeners] of this.eventListeners) {
      this.resubscribeEvent(eventName, listeners);
    }
  }

  setPendingBridgeConnection(pendingBridgeConnection: Promise<WebSocketBridge | null> | null): void {
    this.pendingBridgeConnection = pendingBridgeConnection;
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  onConnectionStateChange(listener: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  private setConnectionState(partial: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...partial };
    for (const listener of this.connectionStateListeners) {
      try {
        listener(this.getConnectionState());
      } catch (error) {
        console.error("[HybridBridge] Connection state listener error:", error);
      }
    }
  }

  async invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>> {
    if (isDesktopOnlyRoute(routeName)) {
      return this.ipcBridge.invoke(routeName, input);
    }

    if (!this.wsBridge) {
      if (this.pendingBridgeConnection) {
        await this.pendingBridgeConnection;
      }
    }

    if (!this.wsBridge) {
      throw new Error("Daemon bridge is not available");
    }

    return this.wsBridge.invoke(routeName, input);
  }

  on<T extends ArgosEventName>(eventName: T, listener: EventListener<ArgosEventPayload<T>>): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener as EventListener);

    if (isDesktopOnlyEvent(eventName)) {
      return this.ipcBridge.on(eventName, listener);
    }

    if (this.wsBridge) {
      this.resubscribeEvent(eventName, this.eventListeners.get(eventName)!);
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

    if (this.wsBridge) {
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
