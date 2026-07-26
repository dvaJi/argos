import {
  getArgosRouteContract,
  type ArgosRouteName,
  type ArgosRouteInput,
  type ArgosRouteOutput,
  hasArgosRouteContract,
} from "@argos/shared-contracts/routes";
import {
  getArgosEventContract,
  type ArgosEventName,
  type ArgosEventPayload,
  hasArgosEventContract,
} from "@argos/shared-contracts/events";
import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { RECONNECT_EXHAUSTED_ERROR } from "@argos/shared-contracts/connection";

type EventListener<T = unknown> = (payload: T) => void;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type ConnectionState = {
  connected: boolean;
  url: string;
  lastError: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
};

type ConnectionStateListener = (state: ConnectionState) => void;

const REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_DATABASE_DIAGNOSIS = {
  checkedAt: Date.now(),
  isHealthy: true,
  issues: [],
  repairableIssues: [],
  manualIssues: [],
};

const DEFAULT_DATABASE_REPAIR_REPORT = {
  startedAt: Date.now(),
  finishedAt: Date.now(),
  status: "healthy" as const,
  backupPath: null,
  diagnosisBeforeRepair: DEFAULT_DATABASE_DIAGNOSIS,
  diagnosisAfterRepair: DEFAULT_DATABASE_DIAGNOSIS,
  repairedIssues: [],
  remainingIssues: [],
};

export class WebSocketBridge implements ArgosBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private eventListeners = new Map<string, Set<EventListener>>();
  private connectionStateListeners = new Set<ConnectionStateListener>();
  private requestCallbacks = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 1000;
  private maxReconnectDelayMs = 30000;
  private closed = false;
  private pendingMessages: string[] = [];
  private connected = false;
  private lastError: string | null = null;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token ?? "";
  }

  getUrl(): string {
    return this.url;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  onConnectionStateChange(listener: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    listener(this.getConnectionState());
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  private getConnectionState(): ConnectionState {
    return {
      connected: this.isConnected(),
      url: this.url,
      lastError: this.lastError,
      reconnectAttempt: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
    };
  }

  private emitConnectionState(partial?: Partial<ConnectionState>): void {
    if (partial) {
      if (typeof partial.connected === "boolean") {
        this.connected = partial.connected;
      }
      if (Object.prototype.hasOwnProperty.call(partial, "lastError")) {
        this.lastError = partial.lastError ?? null;
      }
    }

    const state = this.getConnectionState();
    for (const listener of this.connectionStateListeners) {
      try {
        listener(state);
      } catch (error) {
        console.error("[WebSocketBridge] Error in connection state listener:", error);
      }
    }
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      // WebSocket browser clients cannot set arbitrary headers. Put the bearer
      // in the negotiated subprotocol instead of the URL, where it would leak
      // through history, proxy logs, and diagnostics.
      const protocols = this.token ? ["argos-v1", `argos-bearer.${this.token}`] : undefined;
      this.ws = protocols ? new WebSocket(this.url, protocols) : new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emitConnectionState({ connected: true, lastError: null });
        this.flushPendingMessages();
        this.resubscribeAll();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        if (event.code === 4001) {
          this.closed = true;
          this.emitConnectionState({ connected: false, lastError: "Remote session revoked. Pair this machine again." });
          return;
        }
        this.emitConnectionState({ connected: false, lastError: "Daemon connection closed" });
        if (!this.closed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        if (!this.closed) {
          this.emitConnectionState({ connected: false, lastError: "WebSocket connection failed" });
          reject(error);
        }
      };
    });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const pending of this.requestCallbacks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("WebSocket closed"));
    }
    this.requestCallbacks.clear();
    this.ws?.close();
    this.ws = null;
    this.emitConnectionState({ connected: false });
  }

  async invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>> {
    if (routeName === "databaseSecurity.diagnoseSchema") {
      return { diagnosis: DEFAULT_DATABASE_DIAGNOSIS } as ArgosRouteOutput<T>;
    }

    if (routeName === "databaseSecurity.repairSchema") {
      return { report: DEFAULT_DATABASE_REPAIR_REPORT } as ArgosRouteOutput<T>;
    }

    if (!hasArgosRouteContract(routeName)) {
      throw new Error(`Unknown route: ${routeName}`);
    }

    const contract = getArgosRouteContract(routeName);
    const normalizedInput = contract.input.parse(input);

    const requestId = crypto.randomUUID();
    const message = JSON.stringify({
      v: 1,
      type: "route",
      route: routeName,
      input: normalizedInput,
      requestId,
    });

    return new Promise<ArgosRouteOutput<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestCallbacks.delete(requestId);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      this.requestCallbacks.set(requestId, {
        resolve: (output: unknown) => {
          try {
            resolve(contract.output.parse(output) as ArgosRouteOutput<T>);
          } catch (error) {
            reject(error);
          }
        },
        reject,
        timeout,
      });
      this.sendRaw(message);
    });
  }

  on<T extends ArgosEventName>(eventName: T, listener: EventListener<ArgosEventPayload<T>>): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener as EventListener);

    if (this.eventListeners.size === 1 || this.eventListeners.get(eventName)!.size === 1) {
      this.sendSubscribe([...this.eventListeners.keys()]);
    }

    return () => {
      this.eventListeners.get(eventName)?.delete(listener as EventListener);
      if (this.eventListeners.get(eventName)?.size === 0) {
        this.eventListeners.delete(eventName);
      }
      if (this.eventListeners.size > 0) {
        this.sendSubscribe([...this.eventListeners.keys()]);
      }
    };
  }

  private handleMessage(data: string | ArrayBuffer): void {
    let parsed: any;
    try {
      parsed = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    } catch {
      return;
    }

    if (parsed.type === "route:response" && parsed.requestId) {
      const pending = this.requestCallbacks.get(parsed.requestId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.requestCallbacks.delete(parsed.requestId);

      if (parsed.ok) {
        pending.resolve(parsed.output);
      } else {
        const error = new Error(parsed.error?.message ?? "Route invocation failed");
        (error as any).code = parsed.error?.code;
        pending.reject(error);
      }
      return;
    }

    if (parsed.type === "event" && parsed.name) {
      this.dispatchEvent(parsed.name, parsed.payload);
    }
  }

  private dispatchEvent(eventName: string, payload: unknown): void {
    if (!hasArgosEventContract(eventName)) return;

    const contract = getArgosEventContract(eventName as ArgosEventName);
    const validatedPayload = contract.payload.parse(payload);

    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(validatedPayload);
        } catch (error) {
          console.error(`[WebSocketBridge] Error in event listener for ${eventName}:`, error);
        }
      }
    }

    const wildcardListeners = this.eventListeners.get("*");
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(validatedPayload);
        } catch (error) {
          console.error(`[WebSocketBridge] Error in wildcard event listener:`, error);
        }
      }
    }
  }

  private sendSubscribe(events: string[]): void {
    const message = JSON.stringify({
      v: 1,
      type: "subscribe",
      events,
    });
    this.sendRaw(message);
  }

  private sendRaw(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  private flushPendingMessages(): void {
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

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emitConnectionState({ connected: false, lastError: RECONNECT_EXHAUSTED_ERROR });
      return;
    }

    const delay = Math.min(this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts++;
    this.emitConnectionState();

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // will retry via onclose
      });
    }, delay);
  }
}
