import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { createProviderClient } from "#api/ProviderClient";
import type { AcpAgentDiagnostics } from "@argos/shared/presenter";

const providerClient = createProviderClient();

export interface AcpAuthDialogRequest {
  open: boolean;
  agentId: string;
  agentName: string;
  workdir?: string | null;
  /** Called when the flow reaches "ready" so the caller can retry. */
  onAuthenticated?: () => void;
  onOpenChange: (open: boolean) => void;
}

type FlowState = "select" | "running" | "ready" | "error" | "cancelled";

/**
 * Sign-in dialog for ACP agents. Agent methods call `authenticate` on the
 * daemon; terminal methods run the agent's login TUI in an embedded PTY
 * (xterm). Env-var methods render setup instructions.
 */
export default function AcpAuthDialog({
  open,
  agentId,
  agentName,
  workdir,
  onAuthenticated,
  onOpenChange,
}: AcpAuthDialogRequest) {
  const [diagnostics, setDiagnostics] = useState<AcpAgentDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [flowState, setFlowState] = useState<FlowState>("select");
  const [activeMethod, setActiveMethod] = useState<{ id: string; name: string; mode: "agent" | "terminal" } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);

  const reset = () => {
    setFlowState("select");
    setActiveMethod(null);
    setError(null);
    setRunId(null);
  };

  // Load methods when the dialog opens.
  useEffect(() => {
    if (!open || !agentId) return;
    queueMicrotask(() => {
      setLoading(true);
      reset();
      void providerClient
        .getAcpAgentDiagnostics(agentId, workdir ?? null)
        .then((diagnostics) => setDiagnostics(diagnostics))
        .catch((error) => setError(error instanceof Error ? error.message : String(error)))
        .finally(() => setLoading(false));
    });
  }, [open, agentId, workdir, reset]);

  // Auth state transitions + PTY output. Output that arrives before the
  // embedded terminal is mounted is buffered and flushed on open — the
  // daemon does not replay it.
  const pendingOutputRef = useRef<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const off = providerClient.onAcpAuthChanged((payload) => {
      if (payload.agentId !== agentId) return;
      if (payload.runId && runId && payload.runId !== runId) return;
      if (payload.output) {
        if (xtermRef.current) {
          xtermRef.current.write(payload.output);
        } else {
          pendingOutputRef.current.push(payload.output);
        }
      }
      if (payload.state === "ready") {
        setFlowState("ready");
        onAuthenticated?.();
      } else if (payload.state === "error") {
        setFlowState("error");
        setError(payload.error ?? "Authentication failed");
      } else if (payload.state === "cancelled") {
        setFlowState("select");
      }
    });
    return off;
  }, [open, agentId, runId, onAuthenticated]);

  // Embedded terminal lifecycle for terminal methods.
  useEffect(() => {
    if (flowState !== "running" || activeMethod?.mode !== "terminal" || !terminalRef.current) return;
    const terminal = new Terminal({
      convertEol: false,
      fontSize: 12,
      cursorBlink: true,
    });
    terminal.open(terminalRef.current);
    // Flush output that arrived before the terminal existed.
    for (const chunk of pendingOutputRef.current) {
      terminal.write(chunk);
    }
    pendingOutputRef.current = [];
    terminal.onData((data) => {
      if (runId) void providerClient.writeAcpAuthInput(runId, data);
    });
    terminal.focus();
    xtermRef.current = terminal;
    return () => {
      terminal.dispose();
      xtermRef.current = null;
    };
  }, [flowState, activeMethod, runId]);

  const startMethod = async (methodId: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await providerClient.startAcpAuth({ agentId, workdir: workdir ?? undefined, methodId });
      setActiveMethod({ id: methodId, name, mode: result.mode });
      setRunId(result.runId);
      setFlowState("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFlowState("error");
    }
    setLoading(false);
  };

  const methods = diagnostics?.authMethods ?? [];

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && flowState === "running" && agentId) {
      void providerClient.cancelAcpAuth(agentId).catch(() => undefined);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-w-xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="lucide:key-round" className="size-4" />
            Sign in to {agentName}
          </DialogTitle>
          <DialogDescription>
            This agent requires authentication before it can be used. Choose a method to continue.
          </DialogDescription>
        </DialogHeader>

        {loading && flowState === "select" ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Icon icon="lucide:loader-circle" className="size-4 animate-spin" /> Loading methods…
          </div>
        ) : null}

        {flowState === "select" ? (
          <div className="flex flex-col gap-2">
            {methods.length === 0 && !loading ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                The agent did not advertise any authentication methods. Check the agent's connection status in ACP
                settings.
              </div>
            ) : null}
            {methods.map((method) => {
              if (method.type === "env_var") {
                return (
                  <div key={method.id} className="rounded-lg border border-border p-3 text-xs">
                    <div className="font-medium">{method.name ?? "Environment variables"}</div>
                    {method.vars?.length ? (
                      <div className="mt-1 text-muted-foreground">
                        Set{" "}
                        {method.vars.map((v) => (
                          <code key={v.name} className="mx-0.5 rounded bg-muted px-1 py-0.5">
                            {v.name}
                          </code>
                        ))}{" "}
                        in your environment, then re-check the connection.
                      </div>
                    ) : null}
                    {method.link ? (
                      <a
                        href={method.link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-foreground underline underline-offset-2"
                      >
                        Get credentials <Icon icon="lucide:external-link" className="size-3" />
                      </a>
                    ) : null}
                  </div>
                );
              }
              const mode = method.type === "terminal" ? "terminal" : "agent";
              return (
                <button
                  key={method.id}
                  type="button"
                  disabled={loading}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                  onClick={() => void startMethod(method.id, method.name ?? method.id)}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{method.name ?? method.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {mode === "terminal"
                        ? "Runs the agent's interactive login in an embedded terminal"
                        : "Agent handles authentication"}
                    </span>
                  </span>
                  <Icon
                    icon={mode === "terminal" ? "lucide:terminal" : "lucide:log-in"}
                    className="size-4 text-muted-foreground"
                  />
                </button>
              );
            })}
          </div>
        ) : null}

        {flowState === "running" && activeMethod?.mode === "agent" ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Icon icon="lucide:loader-circle" className="size-4 animate-spin" />
            Waiting for {agentName} to confirm authentication…
          </div>
        ) : null}

        {flowState === "running" && activeMethod?.mode === "terminal" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <Icon icon="lucide:terminal" className="size-3.5" />
                Complete the login in the terminal below
              </span>
              <Badge variant="outline">running</Badge>
            </div>
            <div ref={terminalRef} className="h-64 overflow-hidden rounded-lg border border-border bg-black p-1" />
          </div>
        ) : null}

        {flowState === "ready" ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            <Icon icon="lucide:check-circle-2" className="size-4" />
            Authenticated. You can retry the conversation now.
          </div>
        ) : null}

        {flowState === "error" || error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <Icon icon="lucide:alert-triangle" className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{error ?? "Authentication failed"}</span>
          </div>
        ) : null}

        <DialogFooter>
          {flowState === "running" ? (
            <Button variant="outline" onClick={() => void providerClient.cancelAcpAuth(agentId).catch(() => undefined)}>
              Cancel
            </Button>
          ) : null}
          {flowState === "ready" ? (
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          ) : flowState !== "running" ? (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
