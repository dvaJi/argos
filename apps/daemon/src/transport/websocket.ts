import type { DeepchatEventName, DeepchatEventPayload } from "@argos/shared-contracts/events";

type EventEnvelope = {
  type: "event";
  name: DeepchatEventName;
  payload: DeepchatEventPayload<DeepchatEventName>;
};

export function handleWebSocketUpgrade(): Response {
  return new Response("WebSocket upgrade handled by Bun server", { status: 200 });
}

export function broadcastEvent(_name: DeepchatEventName, _payload: unknown): void {}
