import type { IEventPublisher } from "@argos/backend-core";
import type { ServerWebSocket } from "bun";

type WsData = {
  subscriptions: Set<string>;
};

export class BunEventPublisher implements IEventPublisher {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private clients = new Set<ServerWebSocket<WsData>>();

  addClient(ws: ServerWebSocket<WsData>): void {
    this.clients.add(ws);
  }

  removeClient(ws: ServerWebSocket<WsData>): void {
    this.clients.delete(ws);
  }

  publish(eventName: string, payload: unknown): void {
    const envelope = JSON.stringify({
      type: "event",
      name: eventName,
      payload,
    });

    for (const ws of this.clients) {
      const subs = ws.data.subscriptions;
      if (subs.has(eventName) || subs.has("*")) {
        ws.send(envelope);
      }
    }

    const handlers = this.handlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }

    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(payload);
      }
    }
  }

  subscribe(eventName: string, handler: (payload: unknown) => void): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
    return () => {
      this.handlers.get(eventName)?.delete(handler);
    };
  }
}
