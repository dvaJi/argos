import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import type { ArgosEventPayload } from "@argos/shared-contracts/events";
import { terminalExitEvent, terminalOutputEvent } from "@argos/shared-contracts/events";
import {
  terminalAttachRoute,
  terminalCreateRoute,
  terminalInputRoute,
  terminalKillRoute,
  terminalListRoute,
  terminalResizeRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createTerminalClient(bridge: ArgosBridge = getArgosBridge()) {
  async function create(input: { cwd: string; cols?: number; rows?: number; shell?: string }) {
    const result = await bridge.invoke(terminalCreateRoute.name, input);
    return result;
  }

  async function sendInput(terminalId: string, data: string) {
    await bridge.invoke(terminalInputRoute.name, { terminalId, data });
  }

  async function resize(terminalId: string, cols: number, rows: number) {
    await bridge.invoke(terminalResizeRoute.name, { terminalId, cols, rows });
  }

  async function kill(terminalId: string) {
    await bridge.invoke(terminalKillRoute.name, { terminalId });
  }

  async function list() {
    const result = await bridge.invoke(terminalListRoute.name, {});
    return result.terminals;
  }

  async function attach(terminalId: string) {
    const result = await bridge.invoke(terminalAttachRoute.name, { terminalId });
    return result;
  }

  function onOutput(listener: (payload: ArgosEventPayload<"terminal.output">) => void) {
    return bridge.on(terminalOutputEvent.name, listener);
  }

  function onExit(listener: (payload: ArgosEventPayload<"terminal.exit">) => void) {
    return bridge.on(terminalExitEvent.name, listener);
  }

  return {
    create,
    sendInput,
    resize,
    kill,
    list,
    attach,
    onOutput,
    onExit,
  };
}

type TerminalClient = ReturnType<typeof createTerminalClient>;

export type { TerminalClient };
