import { useEffect, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Button } from "#shadcn/components/ui/button";
import { createTerminalClient, type TerminalClient } from "#api/TerminalClient";
import { terminalStore, useTerminalStore, type TerminalTab } from "#/stores/ui/terminalStore";
import "@xterm/xterm/css/xterm.css";

const TERMINAL_FONT_FAMILY = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

function decodeBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

function createTerminalTheme() {
  return {
    background: cssVar("--background", "#18181b"),
    foreground: cssVar("--foreground", "#d4d4d8"),
    cursor: cssVar("--foreground", "#d4d4d8"),
    cursorAccent: cssVar("--background", "#18181b"),
    selectionBackground: "#3b4252cc",
  };
}

interface TerminalViewProps {
  tab: TerminalTab;
  active: boolean;
  client: TerminalClient;
  registerSink: (terminalId: string, sink: (data: Uint8Array, seq: number) => void) => () => void;
  onRestart: (terminalId: string) => void;
}

function TerminalView({ tab, active, client, registerSink, onRestart }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const attachedSeqRef = useRef<number>(-1);
  const attachedRef = useRef(false);
  const pendingRef = useRef<Array<[Uint8Array, number]>>([]);
  const exitStatus = tab.exitStatus;

  // Create the xterm instance once per terminal session.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 12,
      cursorBlink: true,
      convertEol: false,
      scrollback: 2000,
      theme: createTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      // Container may be hidden (zero size) at mount; the resize observer will fit later.
    }

    const onData = term.onData((data) => {
      void client.sendInput(tab.terminalId, data).catch(() => undefined);
    });

    return () => {
      onData.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [client, tab.terminalId]);

  // Replay scrollback + subscribe to live output for this terminal.
  useEffect(() => {
    attachedRef.current = false;
    attachedSeqRef.current = -1;
    pendingRef.current = [];
    let cancelled = false;

    const unregister = registerSink(tab.terminalId, (data, seq) => {
      if (!attachedRef.current) {
        pendingRef.current.push([data, seq]);
        return;
      }
      if (seq <= attachedSeqRef.current) return; // Already replayed via attach buffer.
      termRef.current?.write(data);
    });

    void client
      .attach(tab.terminalId)
      .then((result) => {
        if (cancelled) return;
        attachedSeqRef.current = result.seq;
        const buffer = decodeBase64(result.buffer);
        if (buffer.length > 0) termRef.current?.write(buffer);
        const pending = pendingRef.current;
        pendingRef.current = [];
        for (const [data, seq] of pending) {
          if (seq > result.seq) termRef.current?.write(data);
        }
        attachedRef.current = true;
      })
      .catch(() => {
        // Terminal may have been disposed server-side; still accept live output.
        attachedRef.current = true;
        const pending = pendingRef.current;
        pendingRef.current = [];
        for (const [data] of pending) termRef.current?.write(data);
      });

    return () => {
      cancelled = true;
      unregister();
    };
  }, [client, registerSink, tab.terminalId]);

  // Forward container resizes to the PTY (debounced via rAF).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame: number | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const fit = fitRef.current;
        const term = termRef.current;
        if (!fit || !term || container.clientWidth === 0 || container.clientHeight === 0) return;
        try {
          fit.fit();
        } catch {
          return;
        }
        const cols = term.cols;
        const rows = term.rows;
        if (cols > 0 && rows > 0 && (cols !== lastCols || rows !== lastRows)) {
          lastCols = cols;
          lastRows = rows;
          void client.resize(tab.terminalId, cols, rows).catch(() => undefined);
        }
      });
    });

    observer.observe(container);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [client, tab.terminalId]);

  // Focus the terminal when its tab becomes active.
  useEffect(() => {
    if (!active) return;
    // Defer so the container is visible (display:none breaks focus).
    const id = window.setTimeout(() => termRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [active]);

  return (
    <div
      className="relative h-full min-h-0 w-full"
      data-testid={`terminal-view-${tab.terminalId}`}
      data-active={String(active)}
    >
      <div ref={containerRef} className="h-full w-full px-2 py-1" />
      {exitStatus && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 text-sm text-muted-foreground">
          <span>
            Session ended
            {exitStatus.exitCode !== null ? ` (exit code ${exitStatus.exitCode})` : ""}
            {exitStatus.signal ? ` — ${exitStatus.signal}` : ""}
          </span>
          <Button variant="outline" size="sm" onClick={() => onRestart(tab.terminalId)}>
            <Icon icon="lucide:rotate-cw" className="mr-1 h-3.5 w-3.5" />
            Restart
          </Button>
        </div>
      )}
    </div>
  );
}

interface TerminalPanelProps {
  workspacePath: string | null;
}

export function TerminalPanel({ workspacePath }: TerminalPanelProps) {
  const client = useMemo(() => createTerminalClient(), []);
  const {
    tabs,
    activeTerminalId,
    creating,
    error,
    connect,
    ensureLoaded,
    createTerminal,
    setActiveTerminal,
    closeTerminal,
    restartTerminal,
    registerSink,
    clearError,
  } = useTerminalStore();

  useEffect(() => {
    const stop = connect();
    void ensureLoaded();
    return stop;
  }, [connect, ensureLoaded]);

  // Create the first terminal at the project root once the panel is used.
  useEffect(() => {
    if (!workspacePath || creating || tabs.length > 0 || error) return;
    let cancelled = false;
    void (async () => {
      await ensureLoaded();
      if (cancelled) return;
      if (terminalStore.state.tabs.length === 0) void createTerminal(workspacePath);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, tabs.length, creating, error, createTerminal, ensureLoaded]);

  const handleRestart = (terminalId: string) => {
    void restartTerminal(terminalId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="terminal-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.terminalId}
              className={`group flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                tab.terminalId === activeTerminalId
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60"
              }`}
            >
              <button
                type="button"
                className="flex items-center gap-1.5"
                onClick={() => setActiveTerminal(tab.terminalId)}
              >
                <Icon icon={tab.exitStatus ? "lucide:square-slash" : "lucide:square-terminal"} className="h-3 w-3" />
                <span className="max-w-32 truncate">{tab.label}</span>
              </button>
              <button
                type="button"
                aria-label={`Close terminal ${tab.label}`}
                className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                onClick={() => closeTerminal(tab.terminalId)}
              >
                <Icon icon="lucide:x" className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          disabled={!workspacePath || creating}
          aria-label="New terminal"
          title={workspacePath ? "New terminal" : "Open a project to create a terminal"}
          onClick={() => workspacePath && void createTerminal(workspacePath)}
        >
          <Icon icon="lucide:plus" className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <span className="truncate">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={clearError} className="shrink-0">
            <Icon icon="lucide:x" className="h-3 w-3" />
          </button>
        </div>
      )}

      {tabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <Icon icon="lucide:square-terminal" className="h-6 w-6" />
          <span>{workspacePath ? "No terminal sessions" : "Open a project to use the terminal"}</span>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {tabs.map((tab) => (
            <div
              key={tab.terminalId}
              className="absolute inset-0"
              style={{ visibility: tab.terminalId === activeTerminalId ? "visible" : "hidden" }}
            >
              <TerminalView
                tab={tab}
                active={tab.terminalId === activeTerminalId}
                client={client}
                registerSink={registerSink}
                onRestart={handleRestart}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
