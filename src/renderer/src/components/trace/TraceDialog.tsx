import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Spinner } from "@shadcn/components/ui/spinner";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "@api/DeviceClient";
import { createSessionClient } from "@api/SessionClient";
import { useMonaco } from "stream-monaco";
import { useUiSettingsStore, getFormattedCodeFontFamily } from "@/stores/uiSettingsStore";
import type { MessageTraceRecord } from "@shared/types/agent-interface";

const deviceClient = createDeviceClient();
const sessionClient = createSessionClient();

interface TraceDialogProps {
  messageId: string | null;
  agentId?: string | null;
  onClose: () => void;
}

export default function TraceDialog({ messageId, onClose }: TraceDialogProps) {
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

    try {
      const result = await sessionClient.listMessageTraces(msgId);
      if (currentRequestId !== requestIdRef.current) return;
      if (!Array.isArray(result) || result.length === 0) {
        setError(true);
        return;
      }
      setTraceList(result);
      setSelectedTraceId(result[0].id);
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
