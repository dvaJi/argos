import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Badge } from "#shadcn/components/ui/badge";
import { Icon } from "@iconify/react";
import type { AcpDebugEventEntry, AcpDebugRequest } from "@argos/shared/presenter";
import { createProviderClient } from "#api/ProviderClient";
import { createConfigClient } from "#api/ConfigClient";
import { useToast } from "#/components/use-toast";
import { nanoid } from "nanoid";

interface AcpDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
}

function createDebugSessionId() {
  return `debug-${nanoid(6)}`;
}

const methodOptions: { value: AcpDebugRequest["action"]; label: string }[] = [
  { value: "initialize", label: "Initialize" },
  { value: "authenticate", label: "Authenticate" },
  { value: "logout", label: "Logout" },
  { value: "newSession", label: "New Session" },
  { value: "loadSession", label: "Load Session" },
  { value: "sessionList", label: "Session List" },
  { value: "sessionResume", label: "Session Resume" },
  { value: "sessionClose", label: "Session Close" },
  { value: "sessionFork", label: "Session Fork" },
  { value: "prompt", label: "Prompt" },
  { value: "cancel", label: "Cancel" },
  { value: "setSessionMode", label: "Set Session Mode" },
  { value: "setSessionModel", label: "Set Session Model" },
  { value: "extMethod", label: "Extension Method" },
  { value: "extNotification", label: "Extension Notification" },
];

export default function AcpDebugDialog({ open, onOpenChange, agentId, agentName }: AcpDebugDialogProps) {
  const { toast } = useToast();
  const providerClient = useMemo(() => createProviderClient(), []);
  const configClient = useMemo(() => createConfigClient(), []);

  const [selectedMethod, setSelectedMethod] = useState<AcpDebugRequest["action"]>("newSession");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AcpDebugEventEntry[]>([]);
  const [processReady, setProcessReady] = useState(false);
  const [customMethod, setCustomMethod] = useState("");
  const [debugSessionId, setDebugSessionId] = useState(createDebugSessionId());
  const seenIds = useRef(new Set<string>());

  const requiresCustomMethod = useMemo(
    () => ["extMethod", "extNotification"].includes(selectedMethod),
    [selectedMethod],
  );
  const sortedEvents = useMemo(() => events.toSorted((a, b) => b.timestamp - a.timestamp), [events]);

  const appendEvents = (items: AcpDebugEventEntry[]) => {
    const newItems = items.filter((e) => !seenIds.current.has(e.id));
    newItems.forEach((e) => seenIds.current.add(e.id));
    if (newItems.length) setEvents((prev) => [...prev, ...newItems]);
  };

  const stringify = (payload: unknown) => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  const eventTone = (kind: AcpDebugEventEntry["kind"]) => {
    if (kind === "request") return "bg-primary/5 border-primary/30";
    if (kind === "lifecycle") return "bg-sky-50 dark:bg-sky-950/30 border-sky-200/60";
    if (kind === "stderr") return "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60";
    if (kind === "response") return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60";
    if (kind === "error") return "bg-destructive/10 border-destructive/30";
    return "bg-muted/40 border-border";
  };

  const eventLabel = (kind: AcpDebugEventEntry["kind"]) => kind;

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

  // Reset the debug session whenever the dialog opens — adjusted during render.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setEvents([]);
      setProcessReady(false);
      setSelectedMethod("newSession");
      setCustomMethod("");
      setDebugSessionId(createDebugSessionId());
    }
  }

  useEffect(() => {
    if (open) {
      seenIds.current.clear();
    }
  }, [open]);

  const handleSend = () => {
    setLoading(true);
    void providerClient
      .runAcpDebugAction({
        agentId,
        action: selectedMethod,
        payload: {},
        sessionId: debugSessionId,
      })
      .then((result) => {
        if (result?.events?.length) appendEvents(result.events);
        if (result?.sessionId) setDebugSessionId(result.sessionId);
        if (result?.status === "ok") setProcessReady(true);
        if (result?.status === "error" && result.error) toast({ title: result.error, variant: "destructive" });
      })
      .catch((error) => toast({ title: "Request failed", description: String(error), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  const runHealthCheck = () => {
    setEvents([]);
    seenIds.current.clear();
    setLoading(true);
    void configClient
      .ensureAcpAgentInstalled(agentId)
      .then(() =>
        providerClient.runAcpDebugAction({
          agentId,
          action: "initialize",
          payload: {},
        }),
      )
      .then((initResult) => {
        appendEvents(initResult.events ?? []);
        if (initResult.status === "error") throw new Error(initResult.error || "Failed");
        setProcessReady(true);
        setSelectedMethod("newSession");
      })
      .catch((error) => {
        setProcessReady(false);
        toast({ title: "Health check failed", description: String(error), variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background text-foreground flex flex-col pt-8 min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold leading-tight">Debug Console</div>
          <p className="text-sm text-muted-foreground">Agent: {agentName}</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${processReady ? "border-emerald-500/50 text-emerald-600" : "border-border"}`}
          >
            <span className={`h-2 w-2 rounded-full ${processReady ? "bg-emerald-500" : "bg-muted-foreground/60"}`} />
            <span>{processReady ? "Process Ready" : "Not Ready"}</span>
          </div>
          <Button size="sm" variant="outline" className="h-8" disabled={loading} onClick={runHealthCheck}>
            {loading ? "Checking..." : "Health Check"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEvents([])}>
            Clear
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[260px_1fr] min-h-0 overflow-hidden h-full">
        <aside className="border-r overflow-y-auto p-3 space-y-2 min-h-0 h-full">
          {methodOptions.map((method) => (
            <button
              key={method.value}
              className={`w-full text-left rounded-md border transition flex flex-col gap-1 px-3 py-2 ${selectedMethod === method.value ? "border-accent-400 bg-accent-400/10" : "border-border hover:border-primary/60"}`}
              disabled={!processReady && method.value !== "initialize"}
              onClick={() => {
                setSelectedMethod(method.value);
                if (!["extMethod", "extNotification"].includes(method.value)) setCustomMethod("");
              }}
            >
              <div className="text-sm font-medium leading-tight">{method.label}</div>
            </button>
          ))}
        </aside>

        <main className="flex flex-col gap-4 p-4 overflow-hidden min-h-0 h-full">
          {requiresCustomMethod && (
            <div className="shrink-0 space-y-1">
              <div className="text-xs text-muted-foreground">Custom Method Name</div>
              <Input
                value={customMethod}
                onChange={(e) => setCustomMethod(e.target.value)}
                placeholder="Method name"
                spellCheck={false}
              />
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center justify-between px-3 py-2 border rounded-md bg-muted/40">
              <div className="text-sm font-medium">Events</div>
              <div className="text-xs text-muted-foreground">{sortedEvents.length} events</div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/40 text-xs min-h-0 rounded-md">
              {!sortedEvents.length && (
                <div className="text-muted-foreground text-xs text-center py-6">No events yet</div>
              )}
              {sortedEvents.map((event) => (
                <div key={event.id} className={`rounded-md border p-2 space-y-1 ${eventTone(event.kind)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{eventLabel(event.kind)}</Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">{formatTime(event.timestamp)}</span>
                    </div>
                    <div className="text-[11px] font-medium truncate">{event.action}</div>
                  </div>
                  {event.message && <div className="text-[11px] text-destructive">{event.message}</div>}
                  {event.payload !== undefined && (
                    <pre className="mt-1 rounded bg-muted px-2 py-1 whitespace-pre-wrap break-words overflow-x-auto text-[11px]">
                      {stringify(event.payload)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border rounded-lg overflow-hidden flex flex-col bg-background/80 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-3 py-3 border-t bg-muted/20 justify-between">
              <div className="text-xs text-muted-foreground">Payload editor placeholder</div>
              <Button size="sm" className="h-9" disabled={loading} onClick={handleSend}>
                {loading && <Icon icon="lucide:loader" className="h-4 w-4 mr-2 animate-spin" />}
                {loading ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
