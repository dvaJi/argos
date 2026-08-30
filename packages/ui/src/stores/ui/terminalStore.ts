import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { ArgosEventPayload } from "@argos/shared-contracts/events";
import type { TerminalExitStatus } from "@argos/shared-contracts/routes";
import { createTerminalClient, type TerminalClient } from "#api/TerminalClient";

export interface TerminalTab {
  terminalId: string;
  shell: string;
  cwd: string;
  label: string;
  exitStatus: TerminalExitStatus | null;
}

export type TerminalOutputSink = (data: Uint8Array, seq: number) => void;

export interface TerminalStoreState {
  tabs: TerminalTab[];
  activeTerminalId: string | null;
  /** Whether the initial `terminal.list` restore has completed. */
  loaded: boolean;
  creating: boolean;
  error: string | null;
}

function basename(shellPath: string): string {
  const normalized = shellPath.replaceAll("\\", "/");
  const last = normalized.split("/").pop() ?? shellPath;
  return last.replace(/\.(exe|cmd|bat)$/i, "") || shellPath;
}

export function createTerminalStore({ client }: { client: TerminalClient }) {
  const store = new Store<TerminalStoreState>({
    tabs: [],
    activeTerminalId: null,
    loaded: false,
    creating: false,
    error: null,
  });

  const sinks = new Map<string, TerminalOutputSink>();

  const activateNeighbor = (removedId: string) => {
    const tabs = store.state.tabs;
    const index = tabs.findIndex((tab) => tab.terminalId === removedId);
    if (index === -1) return null;
    const neighbor = tabs[index + 1] ?? tabs[index - 1];
    return neighbor?.terminalId ?? null;
  };

  const ingestOutput = (payload: ArgosEventPayload<"terminal.output">) => {
    const sink = sinks.get(payload.terminalId);
    if (!sink) return;
    const bytes = Uint8Array.from(atob(payload.data), (char) => char.charCodeAt(0));
    sink(bytes, payload.seq);
  };

  const markExited = (payload: ArgosEventPayload<"terminal.exit">) => {
    store.setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.terminalId === payload.terminalId
          ? { ...tab, exitStatus: { exitCode: payload.exitCode, signal: payload.signal } }
          : tab,
      ),
    }));
  };

  /** Subscribe the store to terminal events. Returns the unsubscribe fn. */
  const connect = () => {
    const stopOutput = client.onOutput(ingestOutput);
    const stopExit = client.onExit(markExited);
    return () => {
      stopOutput();
      stopExit();
    };
  };

  /** Restore sessions that survive from a previous window (daemon keeps PTYs). */
  const ensureLoaded = async () => {
    if (store.state.loaded) return;
    store.setState((prev) => ({ ...prev, loaded: true }));
    try {
      const terminals = await client.list();
      store.setState((prev) => {
        const knownIds = new Set(prev.tabs.map((tab) => tab.terminalId));
        const restored: TerminalTab[] = [];
        for (const terminal of terminals) {
          if (knownIds.has(terminal.terminalId)) continue;
          restored.push({
            terminalId: terminal.terminalId,
            shell: terminal.shell,
            cwd: terminal.cwd,
            label: basename(terminal.shell),
            exitStatus: terminal.exitStatus,
          });
        }
        const tabs = [...prev.tabs, ...restored];
        return {
          ...prev,
          tabs,
          activeTerminalId: prev.activeTerminalId ?? tabs[0]?.terminalId ?? null,
        };
      });
    } catch (error) {
      store.setState((prev) => ({ ...prev, error: (error as Error).message }));
    }
  };

  const createTerminal = async (cwd: string, label?: string) => {
    if (store.state.creating) return null;
    store.setState((prev) => ({ ...prev, creating: true, error: null }));
    try {
      const result = await client.create({ cwd });
      const tab: TerminalTab = {
        terminalId: result.terminalId,
        shell: result.shell,
        cwd: result.cwd,
        label: label ?? basename(result.shell),
        exitStatus: null,
      };
      store.setState((prev) => ({
        ...prev,
        tabs: [...prev.tabs, tab],
        activeTerminalId: tab.terminalId,
      }));
      return tab.terminalId;
    } catch (error) {
      store.setState((prev) => ({ ...prev, error: (error as Error).message }));
      return null;
    } finally {
      store.setState((prev) => ({ ...prev, creating: false }));
    }
  };

  const setActiveTerminal = (terminalId: string) => {
    store.setState((prev) => ({ ...prev, activeTerminalId: terminalId }));
  };

  const closeTerminal = (terminalId: string) => {
    const nextActive =
      store.state.activeTerminalId === terminalId ? activateNeighbor(terminalId) : store.state.activeTerminalId;
    store.setState((prev) => ({
      ...prev,
      tabs: prev.tabs.filter((tab) => tab.terminalId !== terminalId),
      activeTerminalId: nextActive,
    }));
    void client.kill(terminalId).catch(() => undefined);
  };

  /** Replace an exited tab with a fresh shell session. */
  const restartTerminal = async (terminalId: string) => {
    const tab = store.state.tabs.find((candidate) => candidate.terminalId === terminalId);
    if (!tab) return null;
    closeTerminal(terminalId);
    return createTerminal(tab.cwd, tab.label);
  };

  const registerSink = (terminalId: string, sink: TerminalOutputSink) => {
    sinks.set(terminalId, sink);
    return () => {
      if (sinks.get(terminalId) === sink) sinks.delete(terminalId);
    };
  };

  const clearError = () => {
    store.setState((prev) => ({ ...prev, error: null }));
  };

  return {
    store,
    connect,
    ensureLoaded,
    createTerminal,
    setActiveTerminal,
    closeTerminal,
    restartTerminal,
    registerSink,
    clearError,
  };
}

export type TerminalStore = ReturnType<typeof createTerminalStore>;

/**
 * Delays bridge resolution until first use so importing this module (and the
 * components that use it) never touches `window.argos` outside the app.
 */
function createLazyTerminalClient(): TerminalClient {
  let instance: TerminalClient | null = null;
  const get = () => {
    instance ??= createTerminalClient();
    return instance;
  };
  return {
    create: (input) => get().create(input),
    sendInput: (terminalId, data) => get().sendInput(terminalId, data),
    resize: (terminalId, cols, rows) => get().resize(terminalId, cols, rows),
    kill: (terminalId) => get().kill(terminalId),
    list: () => get().list(),
    attach: (terminalId) => get().attach(terminalId),
    onOutput: (listener) => get().onOutput(listener),
    onExit: (listener) => get().onExit(listener),
  };
}

const defaultTerminalStore = createTerminalStore({ client: createLazyTerminalClient() });

export const terminalStore = defaultTerminalStore.store;

export function useTerminalStore() {
  const state = useStore(defaultTerminalStore.store);
  return {
    ...state,
    connect: defaultTerminalStore.connect,
    ensureLoaded: defaultTerminalStore.ensureLoaded,
    createTerminal: defaultTerminalStore.createTerminal,
    setActiveTerminal: defaultTerminalStore.setActiveTerminal,
    closeTerminal: defaultTerminalStore.closeTerminal,
    restartTerminal: defaultTerminalStore.restartTerminal,
    registerSink: defaultTerminalStore.registerSink,
    clearError: defaultTerminalStore.clearError,
  };
}
