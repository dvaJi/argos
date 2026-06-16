import { EventEmitter } from "events";
import type { IEventPublisher } from "../host/interfaces";

type EventHandler = (payload: unknown) => void;

export class SubscriberEventBus extends EventEmitter implements IEventPublisher {
  private handlers = new Map<string, Set<EventHandler>>();

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  publish(eventName: string, payload: unknown): void {
    this.emit(eventName, payload);
    const handlers = this.handlers.get("*");
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  subscribe(eventName: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
    this.on(eventName, handler);

    return () => {
      this.handlers.get(eventName)?.delete(handler);
      this.off(eventName, handler);
    };
  }

  subscriberCount(eventName: string): number {
    return this.handlers.get(eventName)?.size ?? 0;
  }
}
