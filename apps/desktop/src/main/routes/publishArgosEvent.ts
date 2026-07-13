import { eventBus, SendTarget } from "#/eventbus";
import { ARGOS_EVENT_CHANNEL } from "@argos/shared-contracts/channels";
import {
  getArgosEventContract,
  type ArgosEventEnvelope,
  type ArgosEventName,
  type ArgosEventPayload,
} from "@argos/shared-contracts/events";

export function publishArgosEvent<T extends ArgosEventName>(name: T, payload: unknown): void {
  const contract = getArgosEventContract(name);
  const normalizedPayload = contract.payload.parse(payload) as ArgosEventPayload<T>;
  const envelope: ArgosEventEnvelope<T> = {
    name,
    payload: normalizedPayload,
  };

  eventBus.sendToRenderer(ARGOS_EVENT_CHANNEL, SendTarget.ALL_WINDOWS, envelope);
}
