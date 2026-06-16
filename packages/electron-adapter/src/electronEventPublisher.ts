import type { IEventPublisher } from "@argos/backend-core";
import type { eventBus as EventBusType } from "@/eventbus";
import { SendTarget } from "@/eventbus";
import { getArgosEventContract, type ArgosEventName } from "@shared/contracts/events";
import { ARGOS_EVENT_CHANNEL } from "@shared/contracts/channels";

export class ElectronEventPublisher implements IEventPublisher {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  constructor(private readonly eventBusInstance: typeof EventBusType) {}

  publish(eventName: string, payload: unknown): void {
    try {
      const contract = getArgosEventContract(eventName as ArgosEventName);
      const normalizedPayload = contract.payload.parse(payload);
      const envelope = { name: eventName, payload: normalizedPayload };
      this.eventBusInstance.sendToRenderer(ARGOS_EVENT_CHANNEL, SendTarget.ALL_WINDOWS, envelope);
    } catch {
      this.eventBusInstance.sendToMain(eventName, payload);
    }

    const handlers = this.handlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
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
