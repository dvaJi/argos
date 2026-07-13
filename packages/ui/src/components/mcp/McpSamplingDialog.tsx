import { useState, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shadcn/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import ModelChooser from "#/components/ModelChooser";
import ModelIcon from "#/components/icons/ModelIcon";
import {
  useMcpSamplingStore,
  dismissRequest,
  getHasEligibleModel,
  getRequiresVision,
  getSelectedModelSupportsVision,
  selectModel,
  rejectRequest,
  confirmApproval,
  retryPrepareModels,
} from "#/stores/mcpSampling";
import type { RENDERER_MODEL_META } from "@argos/shared/presenter";

export default function McpSamplingDialog() {
  const store = useMcpSamplingStore();
  const [modelSelectOpen, setModelSelectOpen] = useState(false);

  const preferenceSummary = useMemo(() => {
    const prefs = store.request?.modelPreferences;
    if (!prefs) return [] as Array<{ key: string; label: string; value: string }>;

    const entries: Array<{ key: string; label: string; value: string }> = [];
    if (typeof prefs.costPriority === "number") {
      entries.push({ key: "cost", label: "Cost Priority", value: prefs.costPriority.toFixed(2) });
    }
    if (typeof prefs.speedPriority === "number") {
      entries.push({ key: "speed", label: "Speed Priority", value: prefs.speedPriority.toFixed(2) });
    }
    if (typeof prefs.intelligencePriority === "number") {
      entries.push({
        key: "intelligence",
        label: "Intelligence Priority",
        value: prefs.intelligencePriority.toFixed(2),
      });
    }
    if (Array.isArray(prefs.hints) && prefs.hints.length > 0) {
      entries.push({
        key: "hints",
        label: "Model Hints",
        value: prefs.hints.map((hint) => hint?.name ?? "Unknown").join(", "),
      });
    }
    return entries;
  }, [store.request?.modelPreferences]);

  const onModelUpdate = useCallback(
    (model: RENDERER_MODEL_META, providerId: string) => {
      selectModel(model, providerId);
      setModelSelectOpen(false);
    },
    [store],
  );

  const onReject = useCallback(() => {
    void rejectRequest();
  }, [store]);

  const onConfirm = useCallback(() => {
    void confirmApproval();
  }, [store]);

  const onRetryModels = useCallback(() => {
    void retryPrepareModels();
  }, [store]);

  const onDialogToggle = useCallback(
    (open: boolean) => {
      if (!open && !store.isSubmitting) {
        void dismissRequest();
      }
    },
    [store],
  );

  return (
    <Dialog open={store.isOpen} onOpenChange={onDialogToggle}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0">
        <div className="flex h-full max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              MCP Sampling Request - {store.request?.serverLabel || store.request?.serverName || "Unknown Server"}
            </DialogTitle>
            <DialogDescription>An MCP server is requesting to use the LLM</DialogDescription>
          </DialogHeader>

          {store.request && (
            <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 pb-4">
              {store.request.systemPrompt && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between py-2 hover:bg-muted/20 rounded-md px-3 -mx-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">System Prompt</h4>
                      <Icon
                        icon="lucide:chevron-right"
                        className="w-4 h-4 text-muted-foreground transition-transform duration-200"
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 pr-2">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{store.request.systemPrompt}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden">
                <h4 className="text-sm font-semibold text-muted-foreground">Messages</h4>
                <ScrollArea className="flex-1 overflow-y-auto pr-2">
                  <div className="space-y-3">
                    {store.request.messages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className="rounded-md border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <Badge variant="outline" className="capitalize">
                            {message.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{message.type}</span>
                        </div>
                        {message.type === "text" && (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                        )}
                        {message.type === "image" && (
                          <div className="flex flex-col items-start gap-2">
                            {message.dataUrl && (
                              <img
                                src={message.dataUrl}
                                className="max-h-40 rounded-md border object-contain"
                                alt={`Image ${index + 1}`}
                              />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {message.mimeType || "Unknown MIME type"}
                            </span>
                          </div>
                        )}
                        {message.type === "audio" && (
                          <div className="flex flex-col items-start gap-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Icon icon="lucide:music" className="w-4 h-4" />
                              <span>Audio content</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {message.mimeType || "Unknown MIME type"}
                            </span>
                          </div>
                        )}
                        {message.type !== "text" && message.type !== "image" && message.type !== "audio" && (
                          <p className="text-sm text-muted-foreground">Unsupported message type</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {preferenceSummary.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between py-2 hover:bg-muted/20 rounded-md px-3 -mx-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">Model Preferences</h4>
                      <Icon
                        icon="lucide:chevron-right"
                        className="w-4 h-4 text-muted-foreground transition-transform duration-200"
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <ul className="space-y-1 text-sm">
                        {preferenceSummary.map((item) => (
                          <li key={item.key} className="flex items-center gap-2">
                            <span className="font-medium text-muted-foreground">{item.label}</span>
                            <span>{item.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {store.request.maxTokens && (
                <div className="text-xs text-muted-foreground bg-muted/20 rounded-md p-2">
                  Max tokens: {store.request.maxTokens}
                </div>
              )}

              {store.isPreparingModels && (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              )}

              {store.modelPreparationError && (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  <div>Failed to load models</div>
                  <Button variant="outline" className="mt-3" onClick={onRetryModels}>
                    Retry
                  </Button>
                </div>
              )}

              {!store.isPreparingModels && !store.modelPreparationError && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">Respond with</span>
                    <Popover open={modelSelectOpen} onOpenChange={setModelSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          size="sm"
                          disabled={!getHasEligibleModel()}
                        >
                          {store.selectedModel && <ModelIcon modelId={store.selectedProviderId ?? ""} isDark={true} />}
                          <span className="text-xs font-semibold truncate max-w-[140px] text-foreground">
                            {store.selectedModel?.name || "Select model"}
                          </span>
                          <Icon icon="lucide:chevron-right" className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80 border-none bg-transparent p-0 shadow-none">
                        <ModelChooser
                          requiresVision={getRequiresVision()}
                          selectedProviderId={store.selectedProviderId ?? ""}
                          selectedModelId={store.selectedModel?.id ?? ""}
                          onUpdateModel={onModelUpdate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {!getHasEligibleModel() && (
                    <div className="text-sm text-destructive">
                      {getRequiresVision() ? "No vision-capable models available" : "No models available"}
                    </div>
                  )}
                  {getHasEligibleModel() && getRequiresVision() && !getSelectedModelSupportsVision() && (
                    <div className="text-sm text-destructive">Selected model does not support vision</div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter className="border-t border-border/60 bg-card/60 px-6 py-4">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="sm:min-w-[96px]" disabled={store.isSubmitting} onClick={onReject}>
                Reject
              </Button>
              <Button
                className="sm:min-w-[120px]"
                disabled={
                  store.isSubmitting ||
                  store.isPreparingModels ||
                  Boolean(store.modelPreparationError) ||
                  !store.selectedModel ||
                  !getHasEligibleModel()
                }
                onClick={onConfirm}
              >
                {store.isSubmitting && <Icon icon="lucide:loader-2" className="mr-2 h-4 w-4 animate-spin" />}
                {store.isSubmitting ? "Confirming..." : "Send Response"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
