import type { ServerWebSocket } from "bun";

export type WsData = {
  subscriptions: Set<string>;
};

export function handleWebSocketOpen(ws: ServerWebSocket<WsData>): void {
  ws.subscribe("events");
}

export function handleWebSocketClose(ws: ServerWebSocket<WsData>): void {
  ws.unsubscribe("events");
}

export function handleWebSocketMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): void {
  if (typeof message !== "string") return;

  try {
    const parsed = JSON.parse(message);
    if (parsed.type === "subscribe" && Array.isArray(parsed.events)) {
      for (const eventName of parsed.events) {
        ws.subscribe(`event:${eventName}`);
        ws.data.subscriptions.add(eventName);
      }
    } else if (parsed.type === "unsubscribe" && Array.isArray(parsed.events)) {
      for (const eventName of parsed.events) {
        ws.unsubscribe(`event:${eventName}`);
        ws.data.subscriptions.delete(eventName);
      }
    }
  } catch {
    // ignore malformed messages
  }
}
