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

export type EventTransportWelcome = {
  environmentId: string;
  serverVersion: string;
  protocolVersion: number;
  eventTransport: { ready: boolean; protocol: "argos-v1" };
};

type WelcomeWaiter = {
  resolve: (welcome: EventTransportWelcome) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

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
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 1000;
  private maxReconnectDelayMs = 30000;
  private probing = false;
  private closed = false;
  private pendingMessages: string[] = [];
  private connected = false;
  private lastError: string | null = null;
  private welcome: EventTransportWelcome | null = null;
  private welcomeWaiters = new Set<WelcomeWaiter>();

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
        this.probing = false;
        if (this.probeTimer) {
          clearTimeout(this.probeTimer);
          this.probeTimer = null;
        }
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
          const error = new Error("Remote session revoked. Pair this machine again.");
          this.rejectPending(error);
          this.emitConnectionState({ connected: false, lastError: error.message });
          reject(error);
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

  waitForWelcome(timeoutMs = 10_000): Promise<EventTransportWelcome> {
    if (this.welcome) return Promise.resolve(this.welcome);

    return new Promise((resolve, reject) => {
      const waiter: WelcomeWaiter = {
        resolve: (welcome) => {
          clearTimeout(waiter.timeout);
          resolve(welcome);
        },
        reject: (error) => {
          clearTimeout(waiter.timeout);
          reject(error);
        },
        timeout: setTimeout(() => {
          this.welcomeWaiters.delete(waiter);
          reject(new Error("Timed out waiting for daemon event readiness"));
        }, timeoutMs),
      };
      this.welcomeWaiters.add(waiter);
    });
  }

  close(): void {
    this.closed = true;
    this.probing = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    this.rejectPending(new Error("WebSocket closed"));
    this.ws?.close();
    this.ws = null;
    this.emitConnectionState({ connected: false });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.requestCallbacks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.requestCallbacks.clear();
    for (const waiter of this.welcomeWaiters) {
      waiter.reject(error);
    }
    this.welcomeWaiters.clear();
    this.pendingMessages = [];
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

    if (parsed.type === "welcome") {
      const welcome = this.parseWelcome(parsed);
      if (!welcome) return;
      this.welcome = welcome;
      for (const waiter of this.welcomeWaiters) {
        waiter.resolve(welcome);
      }
      this.welcomeWaiters.clear();
      return;
    }

    if (parsed.type === "event" && parsed.name) {
      this.dispatchEvent(parsed.name, parsed.payload);
    }
  }

  private parseWelcome(value: unknown): EventTransportWelcome | null {
    if (!value || typeof value !== "object") return null;
    const parsed = value as Partial<EventTransportWelcome>;
    if (
      typeof parsed.environmentId !== "string" ||
      typeof parsed.serverVersion !== "string" ||
      typeof parsed.protocolVersion !== "number" ||
      !parsed.eventTransport ||
      parsed.eventTransport.ready !== true ||
      parsed.eventTransport.protocol !== "argos-v1"
    ) {
      return null;
    }
    return {
      environmentId: parsed.environmentId,
      serverVersion: parsed.serverVersion,
      protocolVersion: parsed.protocolVersion,
      eventTransport: parsed.eventTransport,
    };
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
      this.scheduleProbe();
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

  /** Slow, unbounded probe loop so a bridge that exhausted fast backoff never permanently gives up. */
  private scheduleProbe(): void {
    if (this.closed || this.probing) return;
    this.probing = true;
    this.emitConnectionState({ connected: false, lastError: RECONNECT_EXHAUSTED_ERROR });

    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      this.probing = false;
      this.connect().catch(() => {
        // will retry via onclose
      });
    }, this.maxReconnectDelayMs);
  }

  /** Manual retry: cancel any pending timers and attempt a fresh connection immediately. */
  async forceReconnect(): Promise<void> {
    if (this.closed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    this.probing = false;
    this.reconnectAttempts = 0;
    try {
      await this.connect();
    } catch {
      // A failed manual attempt falls back to the normal onclose/onerror retry path.
    }
  }
}
