import { useState, useReducer, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "#shadcn/components/ui/dialog";
import { Button } from "#shadcn/components/ui/button";
import { Spinner } from "#shadcn/components/ui/spinner";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "#api/DeviceClient";
import { createSessionClient } from "#api/SessionClient";
import { DiffsCodePane } from "#/components/sidepanel/viewer/DiffsCodePane";
import type { MessageTraceRecord } from "@argos/shared/types/agent-interface";
import type { ArgosTapeViewManifestRecord } from "@argos/shared/types/tape-view-manifest";
import ManifestPanel from "./ManifestPanel";

const deviceClient = createDeviceClient();
const sessionClient = createSessionClient();

type LoadState = {
  loading: boolean;
  error: boolean;
  traces: MessageTraceRecord[];
  selectedTraceId: string | null;
  manifests: ArgosTapeViewManifestRecord[];
};

type LoadAction =
  | { type: "reset" }
  | { type: "loaded"; traces: MessageTraceRecord[]; manifests: ArgosTapeViewManifestRecord[] }
  | { type: "error" }
  | { type: "selectTrace"; traceId: string };

const initialLoadState: LoadState = {
  loading: false,
  error: false,
  traces: [],
  selectedTraceId: null,
  manifests: [],
};

function loadReducer(state: LoadState, action: LoadAction): LoadState {
  switch (action.type) {
    case "reset":
      return { ...initialLoadState, loading: true };
    case "loaded":
      return {
        loading: false,
        error: false,
        traces: action.traces,
        selectedTraceId: action.traces[0]?.id ?? null,
        manifests: action.manifests,
      };
    case "error":
      return { ...state, loading: false, error: true };
    case "selectTrace":
      return { ...state, selectedTraceId: action.traceId };
    default:
      return state;
  }
}

interface TraceDialogProps {
  messageId: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  onClose: () => void;
}

export default function TraceDialog({ messageId, sessionId, onClose }: TraceDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const requestIdRef = useRef(0);
  const [loadState, dispatch] = useReducer(loadReducer, initialLoadState);
  const { loading, error, traces: traceList, selectedTraceId, manifests } = loadState;
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);

  const selectedTrace = useMemo(() => {
    if (!traceList.length) return null;
    if (selectedTraceId) {
      const matched = traceList.find((item) => item.id === selectedTraceId);
      if (matched) return matched;
    }
    return traceList[0] ?? null;
  }, [traceList, selectedTraceId]);

  const lineage = useMemo(
    () =>
      manifests
        .slice()
        .sort((a, b) => (a.manifest.assembledAt ?? a.createdAt) - (b.manifest.assembledAt ?? b.createdAt)),
    [manifests],
  );

  const selectedManifest = useMemo(() => {
    if (!manifests.length) return null;
    if (selectedManifestId) {
      const matched = manifests.find((m) => m.manifest.viewId === selectedManifestId);
      if (matched) return matched;
    }
    if (!selectedTrace) return null;
    return manifests.find((m) => m.messageId === selectedTrace.messageId) ?? null;
  }, [selectedManifestId, selectedTrace, manifests]);

  const parsedHeaders = useMemo(() => {
    if (!selectedTrace) return {};
    try {
      return JSON.parse(selectedTrace.headersJson);
    } catch {
      return selectedTrace.headersJson;
    }
  }, [selectedTrace]);

  const parsedBody = useMemo(() => {
    if (!selectedTrace) return {};
    try {
      return JSON.parse(selectedTrace.bodyJson);
    } catch {
      return selectedTrace.bodyJson;
    }
  }, [selectedTrace]);

  const formattedJson = useMemo(() => {
    if (!selectedTrace) return "";
    const fullData = {
      endpoint: selectedTrace.endpoint,
      headers: parsedHeaders,
      body: parsedBody,
      truncated: selectedTrace.truncated,
      requestSeq: selectedTrace.requestSeq,
    };
    return JSON.stringify(fullData, null, 2);
  }, [selectedTrace, parsedHeaders, parsedBody]);

  useEffect(() => {
    if (messageId) {
      setIsOpen(true);
      loadTraces(messageId);
    } else {
      setIsOpen(false);
      resetState();
    }
  }, [messageId]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      onClose();
    }
  }, [isOpen]);

  const loadTraces = async (msgId: string) => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    dispatch({ type: "reset" });
    setSelectedManifestId(null);

    try {
      const tracePromise = sessionClient.listMessageTraces(msgId);
      const manifestPromise = sessionId
        ? sessionClient.getViewManifests(sessionId).catch(() => [])
        : Promise.resolve([]);

      if (currentRequestId !== requestIdRef.current) return;

      const [result, manifestResult] = await Promise.all([tracePromise, manifestPromise]);

      if (currentRequestId !== requestIdRef.current) return;
      if (!Array.isArray(result) || result.length === 0) {
        dispatch({ type: "error" });
        return;
      }
      dispatch({ type: "loaded", traces: result, manifests: manifestResult });
    } catch {
      if (currentRequestId === requestIdRef.current) {
        dispatch({ type: "error" });
      }
    }
  };

  const copyJson = useCallback(async () => {
    if (!formattedJson) return;
    try {
      deviceClient.copyText(formattedJson);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy JSON:", err);
    }
  }, [formattedJson]);

  const resetState = useCallback(() => {
    dispatch({ type: "reset" });
    setCopySuccess(false);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetState();
    onClose();
  }, [resetState, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Message Trace</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-6" />
            <span className="ml-2 text-muted-foreground">Loading trace data...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Icon icon="lucide:alert-circle" className="w-12 h-12 text-destructive mb-2" />
            <h3 className="text-lg font-semibold mb-1">Error</h3>
            <p className="text-sm text-muted-foreground">Failed to load trace data</p>
          </div>
        )}

        {selectedTrace && !loading && !error && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {lineage.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Lineage:</span>
                {lineage.map((node, index) => {
                  const integrity = node.integrity ?? "unverified";
                  const isActive = !!selectedManifest && node.manifest.viewId === selectedManifest.manifest.viewId;
                  return (
                    <Fragment key={node.manifest.viewId}>
                      {index > 0 && <Icon icon="lucide:chevron-right" className="w-3 h-3 text-muted-foreground" />}
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className={
                          integrity === "invalid"
                            ? "border-destructive text-destructive"
                            : integrity === "unverified"
                              ? "opacity-70"
                              : ""
                        }
                        onClick={() => setSelectedManifestId(node.manifest.viewId)}
                      >
                        #{node.requestSeq}
                      </Button>
                    </Fragment>
                  );
                })}
              </div>
            )}
            {traceList.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {traceList.map((trace) => (
                  <Button
                    key={trace.id}
                    size="sm"
                    variant={trace.id === selectedTrace.id ? "default" : "outline"}
                    onClick={() => dispatch({ type: "selectTrace", traceId: trace.id })}
                  >
                    #{trace.requestSeq}
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <span className="font-semibold">Endpoint:</span>
                <div className="mt-1 px-2 py-1 bg-muted rounded break-all">
                  <span className="text-xs">{selectedTrace.endpoint}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <span className="font-semibold">Provider:</span>
                  <span className="ml-2 break-words">{selectedTrace.providerId}</span>
                </div>
                <div className="min-w-0">
                  <span className="font-semibold">Model:</span>
                  <span className="ml-2 break-words">{selectedTrace.modelId}</span>
                </div>
              </div>
            </div>

            {selectedManifest && <ManifestPanel record={selectedManifest} />}

            <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden min-h-[300px]">
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-muted border-b">
                <span className="text-sm font-semibold">Body</span>
                <Button variant="ghost" size="sm" onClick={copyJson}>
                  <Icon icon="lucide:copy" className="w-4 h-4 mr-1" />
                  {copySuccess ? "Copied!" : "Copy JSON"}
                </Button>
              </div>
              <div className="flex-1 min-h-0 bg-muted/30">
                <DiffsCodePane source={{ id: "trace-body", content: formattedJson, name: "trace.json" }} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
