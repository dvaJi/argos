import {
  getDeepchatRouteContract,
  type DeepchatRouteName,
  type DeepchatRouteInput,
  type DeepchatRouteOutput,
  hasDeepchatRouteContract,
  DEEPCHAT_ROUTE_CATALOG,
} from "@argos/shared-contracts/routes";
import {
  getDeepchatEventContract,
  type DeepchatEventName,
  type DeepchatEventPayload,
  hasDeepchatEventContract,
} from "@argos/shared-contracts/events";
import type { DeepchatBridge } from "@argos/shared-contracts/bridge";

type EventListener<T = unknown> = (payload: T) => void;

export class WebSocketBridge implements DeepchatBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private eventListeners = new Map<string, Set<EventListener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 1000;
  private maxReconnectDelayMs = 30000;
  private closed = false;
  private pendingMessages: string[] = [];

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token ?? "";
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      const wsUrl = this.token ? `${this.url}?token=${encodeURIComponent(this.token)}` : this.url;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.flushPendingMessages();
        this.resubscribeAll();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        if (!this.closed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        if (!this.closed) {
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
    this.ws?.close();
    this.ws = null;
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

    const response = await this.sendRequest<{
      ok: boolean;
      output?: DeepchatRouteOutput<T>;
      error?: { code: string; message: string };
    }>(message);

    if (!response.ok) {
      const error = new Error(response.error?.message ?? "Route invocation failed");
      (error as any).code = response.error?.code;
      throw error;
    }

    return contract.output.parse(response.output) as DeepchatRouteOutput<T>;
  }

  on<T extends DeepchatEventName>(eventName: T, listener: EventListener<DeepchatEventPayload<T>>): () => void {
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
    try {
      const parsed = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
      if (parsed.type === "event" && parsed.name) {
        this.dispatchEvent(parsed.name, parsed.payload);
      }
    } catch {
      // ignore malformed messages
    }
  }

  private dispatchEvent(eventName: string, payload: unknown): void {
    if (!hasDeepchatEventContract(eventName)) return;

    const contract = getDeepchatEventContract(eventName as DeepchatEventName);
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
      type: "subscribe",
      events,
    });
    this.sendRaw(message);
  }

  private sendRequest<T>(message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.pendingMessages.push(message);
        reject(new Error("WebSocket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Request timeout"));
      }, 30000);

      const originalOnMessage = this.ws.onmessage;
      this.ws.onmessage = (event) => {
        clearTimeout(timeout);
        this.ws!.onmessage = originalOnMessage;
        this.handleMessage(event.data);

        try {
          const parsed = JSON.parse(event.data);
          if (parsed.requestId) {
            resolve(parsed as T);
            return;
          }
        } catch {
          // not our response
        }

        if (originalOnMessage) {
          (originalOnMessage as any)(event);
        }
      };

      this.ws.send(message);
    });
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
    if (this.closed || this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // will retry via onclose
      });
    }, delay);
  }
}
