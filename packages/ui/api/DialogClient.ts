import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { dialogRequestedEvent } from "@argos/shared-contracts/events";
import { dialogErrorRoute, dialogRespondRoute } from "@argos/shared-contracts/routes";
import type { DialogResponse } from "@argos/shared/presenter";
import { getArgosBridge } from "./core";

export function createDialogClient(bridge: ArgosBridge = getArgosBridge()) {
  async function handleDialogResponse(response: DialogResponse) {
    await bridge.invoke(dialogRespondRoute.name, response);
  }

  async function handleDialogError(id: string) {
    await bridge.invoke(dialogErrorRoute.name, { id });
  }

  function onRequested(
    listener: (payload: {
      id: string;
      title: string;
      description?: string;
      icon?: { icon: string; class: string };
      buttons: Array<{ key: string; label: string; default?: boolean }>;
      timeout: number;
      version: number;
    }) => void,
  ) {
    return bridge.on(dialogRequestedEvent.name, listener);
  }

  return {
    handleDialogResponse,
    handleDialogError,
    onRequested,
  };
}

export type DialogClient = ReturnType<typeof createDialogClient>;
