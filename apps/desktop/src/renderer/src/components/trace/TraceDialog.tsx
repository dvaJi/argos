import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import { Spinner } from "@shadcn/components/ui/spinner";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "@api/DeviceClient";
import { createSessionClient } from "@api/SessionClient";
import { useMonaco } from "stream-monaco";
import { useUiSettingsStore, getFormattedCodeFontFamily } from "@/stores/uiSettingsStore";
import type { MessageTraceRecord } from "@shared/types/agent-interface";
import type { ArgosTapeViewManifestRecord } from "@shared/types/tape-view-manifest";

const deviceClient = createDeviceClient();
const sessionClient = createSessionClient();

interface TraceDialogProps {
  messageId: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  onClose: () => void;
}

export default function TraceDialog({ messageId, sessionId, onClose }: TraceDialogProps) {
  const uiSettingsStore = useUiSettingsStore();
  const jsonEditorRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const requestIdRef = useRef(0);
  const [traceList, setTraceList] = useState<MessageTraceRecord[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const [manifests, setManifests] = useState<ArgosTapeViewManifestRecord[]>([]);
  const [showRefs, setShowRefs] = useState(false);

  const { cleanupEditor, getEditorView } = useMonaco({
    readOnly: true,
    wordWrap: "off",
    wrappingIndent: "same",
    fontFamily: getFormattedCodeFontFamily(),
    minimap: { enabled: false },
    scrollBeyondLastLine: true,
    fontSize: 12,
    lineNumbers: "on",
    folding: true,
    automaticLayout: true,
    scrollbar: {
      horizontal: "visible",
      vertical: "visible",
      horizontalScrollbarSize: 10,
      verticalScrollbarSize: 10,
    },
  });

  const selectedTrace = useMemo(() => {
    if (!traceList.length) return null;
    if (selectedTraceId) {
      const matched = traceList.find((item) => item.id === selectedTraceId);
      if (matched) return matched;
    }
    return traceList[0] ?? null;
  }, [traceList, selectedTraceId]);

  const selectedManifest = useMemo(() => {
    if (!selectedTrace || !manifests.length) return null;
    return manifests.find((m) => m.messageId === selectedTrace.messageId) ?? null;
  }, [selectedTrace, manifests]);

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

  useEffect(() => {
    const applyFontFamily = (fontFamily: string) => {
      const editor = getEditorView();
      if (editor) editor.updateOptions({ fontFamily });
    };
    applyFontFamily(getFormattedCodeFontFamily());
  }, [getFormattedCodeFontFamily()]);

  useEffect(() => {
    return () => {
      cleanupEditor();
      setEditorInitialized(false);
    };
  }, []);

  const loadTraces = async (msgId: string) => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setLoading(true);
    setError(false);
    setTraceList([]);
    setSelectedTraceId(null);
    setManifests([]);

    try {
      const [result, manifestResult] = await Promise.all([
        sessionClient.listMessageTraces(msgId),
        sessionId ? sessionClient.getViewManifests(sessionId).catch(() => []) : Promise.resolve([]),
      ]);
      if (currentRequestId !== requestIdRef.current) return;
      if (!Array.isArray(result) || result.length === 0) {
        setError(true);
        return;
      }
      setTraceList(result);
      setSelectedTraceId(result[0].id);
      setManifests(manifestResult);
    } catch {
      if (currentRequestId === requestIdRef.current) {
        setError(true);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
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
    setLoading(false);
    setError(false);
    setCopySuccess(false);
    setTraceList([]);
    setSelectedTraceId(null);
    setManifests([]);
    setShowRefs(false);
    cleanupEditor();
    setEditorInitialized(false);
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
            {traceList.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {traceList.map((trace) => (
                  <Button
                    key={trace.id}
                    size="sm"
                    variant={trace.id === selectedTrace.id ? "default" : "outline"}
                    onClick={() => setSelectedTraceId(trace.id)}
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

            {selectedManifest && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={
                      selectedManifest.integrity === "valid"
                        ? "default"
                        : selectedManifest.integrity === "invalid"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {selectedManifest.integrity === "valid"
                      ? "Intact"
                      : selectedManifest.integrity === "invalid"
                        ? "Tampered"
                        : "Unverified"}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">{selectedManifest.manifest.viewId}</span>
                  {selectedManifest.manifest.parentViewId && (
                    <span className="text-xs text-muted-foreground">
                      <Icon icon="lucide:arrow-left" className="inline w-3 h-3" />{" "}
                      {selectedManifest.manifest.parentViewId}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Task: <span className="text-foreground">{selectedManifest.manifest.taskType}</span>
                  </span>
                  <span>
                    Policy: <span className="text-foreground">{selectedManifest.manifest.policy}</span>
                  </span>
                  <span>
                    Budget:{" "}
                    <span className="text-foreground">
                      {selectedManifest.manifest.tokenBudget.estimatedPromptTokens}
                    </span>{" "}
                    / {selectedManifest.manifest.tokenBudget.contextLength} tokens
                  </span>
                  <span>
                    Hash:{" "}
                    <span className="text-foreground font-mono">
                      {selectedManifest.manifest.hashes.manifestHash.slice(0, 12)}
                    </span>
                  </span>
                </div>

                <div className="text-xs">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition"
                    onClick={() => setShowRefs(!showRefs)}
                  >
                    {selectedManifest.manifest.included.length} included, {selectedManifest.manifest.excluded.length}{" "}
                    excluded{" "}
                    <Icon icon={showRefs ? "lucide:chevron-up" : "lucide:chevron-down"} className="inline w-3 h-3" />
                  </button>
                  {showRefs && (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {selectedManifest.manifest.included.length > 0 && (
                        <div>
                          <div className="font-semibold text-foreground mb-1">Included</div>
                          {selectedManifest.manifest.included.map((ref, i) => (
                            <div key={i} className="flex items-center gap-2 pl-2 text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                {ref.role ?? "—"}
                              </Badge>
                              <span>{ref.reason}</span>
                              <span className="text-[10px]">({ref.source})</span>
                              {ref.messageId && (
                                <span className="font-mono text-[10px]">{ref.messageId.slice(0, 12)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedManifest.manifest.excluded.length > 0 && (
                        <div>
                          <div className="font-semibold text-foreground mb-1">Excluded</div>
                          {selectedManifest.manifest.excluded.map((ref, i) => (
                            <div key={i} className="flex items-center gap-2 pl-2 text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                {ref.reason}
                              </Badge>
                              {ref.messageId && (
                                <span className="font-mono text-[10px]">{ref.messageId.slice(0, 12)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden min-h-[300px]">
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-muted border-b">
                <span className="text-sm font-semibold">Body</span>
                <Button variant="ghost" size="sm" onClick={copyJson}>
                  <Icon icon="lucide:copy" className="w-4 h-4 mr-1" />
                  {copySuccess ? "Copied!" : "Copy JSON"}
                </Button>
              </div>
              <div className="flex-1 min-h-0 bg-muted/30 relative">
                <div ref={jsonEditorRef} className="absolute inset-0" />
                {formattedJson && !editorInitialized && (
                  <div className="absolute inset-0 p-4 overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap break-words">
                      <code>{formattedJson}</code>
                    </pre>
                  </div>
                )}
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
