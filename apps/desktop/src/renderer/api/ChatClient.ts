import type { ArgosBridge } from "@shared/contracts/bridge";
import {
  chatPlanUpdatedEvent,
  chatStreamCompletedEvent,
  chatStreamFailedEvent,
  chatStreamUpdatedEvent,
  type ArgosEventPayload,
} from "@shared/contracts/events";
import type { ArgosRouteInput } from "@shared/contracts/routes";
import {
  chatSendMessageRoute,
  chatSteerActiveTurnRoute,
  chatStopStreamRoute,
  chatRespondToolInteractionRoute,
} from "@shared/contracts/routes";
import type { SendMessageInput, ToolInteractionResponse } from "@shared/types/agent-interface";
import { getArgosBridge } from "./core";

export function createChatClient(bridge: ArgosBridge = getArgosBridge()) {
  async function sendMessage(sessionId: string, content: string | SendMessageInput) {
    const input = {
      sessionId,
      content,
    } as ArgosRouteInput<typeof chatSendMessageRoute.name>;

    return await bridge.invoke(chatSendMessageRoute.name, input);
  }

  async function steerActiveTurn(sessionId: string, content: string | SendMessageInput) {
    const input = {
      sessionId,
      content,
    } as ArgosRouteInput<typeof chatSteerActiveTurnRoute.name>;

    return await bridge.invoke(chatSteerActiveTurnRoute.name, input);
  }

  async function stopStream(input: { sessionId?: string; requestId?: string }) {
    return await bridge.invoke(chatStopStreamRoute.name, input);
  }

  async function respondToolInteraction(input: {
    sessionId: string;
    messageId: string;
    toolCallId: string;
    response: ToolInteractionResponse;
  }) {
    return await bridge.invoke(
      chatRespondToolInteractionRoute.name,
      input as ArgosRouteInput<typeof chatRespondToolInteractionRoute.name>,
    );
  }

  function onStreamUpdated(listener: (payload: ArgosEventPayload<"chat.stream.updated">) => void) {
    return bridge.on(chatStreamUpdatedEvent.name, listener);
  }

  function onStreamCompleted(listener: (payload: ArgosEventPayload<"chat.stream.completed">) => void) {
    return bridge.on(chatStreamCompletedEvent.name, listener);
  }

  function onStreamFailed(listener: (payload: ArgosEventPayload<"chat.stream.failed">) => void) {
    return bridge.on(chatStreamFailedEvent.name, listener);
  }

  function onPlanUpdated(listener: (payload: ArgosEventPayload<"chat.plan.updated">) => void) {
    return bridge.on(chatPlanUpdatedEvent.name, listener);
  }

  return {
    sendMessage,
    steerActiveTurn,
    stopStream,
    respondToolInteraction,
    onStreamUpdated,
    onStreamCompleted,
    onStreamFailed,
    onPlanUpdated,
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
