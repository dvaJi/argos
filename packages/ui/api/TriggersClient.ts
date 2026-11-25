import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  triggersListRoute,
  triggersRemoveRoute,
  triggersToggleRoute,
  triggersUpsertRoute,
  triggerUpsertInputSchema,
} from "@argos/shared-contracts/routes/triggers.routes";
import type { TriggerUpsertInput } from "@argos/shared/triggers";
import { getArgosBridge } from "./core";

export function createTriggersClient(bridge: ArgosBridge = getArgosBridge()) {
  async function list() {
    const result = await bridge.invoke(triggersListRoute.name, {});
    return result.triggers;
  }

  async function upsert(input: TriggerUpsertInput) {
    const parsed = triggerUpsertInputSchema.parse(input);
    const result = await bridge.invoke(triggersUpsertRoute.name, parsed);
    return result.trigger;
  }

  async function remove(id: string) {
    const result = await bridge.invoke(triggersRemoveRoute.name, { id });
    return result.removed;
  }

  async function toggle(id: string, enabled: boolean) {
    const result = await bridge.invoke(triggersToggleRoute.name, { id, enabled });
    return result.trigger;
  }

  return { list, upsert, remove, toggle };
}
