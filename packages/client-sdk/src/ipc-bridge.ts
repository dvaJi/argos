import type { IpcRendererEvent } from "electron";
import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { ARGOS_EVENT_CHANNEL, ARGOS_ROUTE_INVOKE_CHANNEL } from "@argos/shared-contracts/channels";
import {
  getArgosEventContract,
  hasArgosEventContract,
  type ArgosEventEnvelope,
  type ArgosEventName,
} from "@argos/shared-contracts/events";
import {
  getArgosRouteContract,
  hasArgosRouteContract,
  type ArgosRouteInput,
  type ArgosRouteName,
  type ArgosRouteOutput,
} from "@argos/shared-contracts/routes";

export type IpcRendererLike = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void;
};

function isArgosEventEnvelope(value: unknown): value is ArgosEventEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const maybeEnvelope = value as { name?: unknown };
  return typeof maybeEnvelope.name === "string" && hasArgosEventContract(maybeEnvelope.name);
}

type SharedEventListener = (payload: unknown) => void;

type BridgeEventRuntime = {
  attached: boolean;
  dispatch: (event: IpcRendererEvent, envelope: unknown) => void;
  listeners: Map<ArgosEventName, Set<SharedEventListener>>;
};

const bridgeEventRuntimes = new WeakMap<IpcRendererLike, BridgeEventRuntime>();

function getBridgeEventRuntime(ipcRenderer: IpcRendererLike): BridgeEventRuntime {
  const existingRuntime = bridgeEventRuntimes.get(ipcRenderer);
  if (existingRuntime) {
    return existingRuntime;
  }

  const runtime: BridgeEventRuntime = {
    attached: false,
    listeners: new Map(),
    dispatch: (_event: IpcRendererEvent, envelope: unknown) => {
      if (!isArgosEventEnvelope(envelope)) {
        return;
      }

      const listeners = runtime.listeners.get(envelope.name);
      if (!listeners || listeners.size === 0) {
        return;
      }

      const contract = getArgosEventContract(envelope.name);
      const payload = contract.payload.parse(envelope.payload);
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error(`[ArgosBridge] Event listener failed for ${envelope.name}:`, error);
        }
      });
    },
  };

  bridgeEventRuntimes.set(ipcRenderer, runtime);
  return runtime;
}

export function createBridge(ipcRenderer: IpcRendererLike): ArgosBridge {
  return {
    async invoke<T extends ArgosRouteName>(routeName: T, input: ArgosRouteInput<T>): Promise<ArgosRouteOutput<T>> {
      if (!hasArgosRouteContract(routeName)) {
        throw new Error(`Unknown argos route: ${routeName}`);
      }

      const contract = getArgosRouteContract(routeName);
      const normalizedInput = contract.input.parse(input);
      const output = await ipcRenderer.invoke(ARGOS_ROUTE_INVOKE_CHANNEL, routeName, normalizedInput);
      return contract.output.parse(output) as ArgosRouteOutput<T>;
    },

    on<T extends ArgosEventName>(eventName: T, listener: (payload: ArgosEventEnvelope<T>["payload"]) => void) {
      const runtime = getBridgeEventRuntime(ipcRenderer);
      const listeners = runtime.listeners.get(eventName) ?? new Set<SharedEventListener>();
      listeners.add(listener as SharedEventListener);
      runtime.listeners.set(eventName, listeners);

      if (!runtime.attached) {
        ipcRenderer.on(ARGOS_EVENT_CHANNEL, runtime.dispatch);
        runtime.attached = true;
      }

      return () => {
        const currentListeners = runtime.listeners.get(eventName);
        if (!currentListeners) {
          return;
        }

        currentListeners.delete(listener as SharedEventListener);
        if (currentListeners.size === 0) {
          runtime.listeners.delete(eventName);
        }

        if (runtime.attached && runtime.listeners.size === 0) {
          ipcRenderer.removeListener(ARGOS_EVENT_CHANNEL, runtime.dispatch);
          runtime.attached = false;
        }
      };
    },
  };
}
