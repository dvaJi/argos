import { type FC, useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "#shadcn/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { useMcpStore } from "#/stores/mcp";
import McpJsonViewer from "./McpJsonViewer";
import type { PromptListEntry } from "@argos/shared/presenter";
interface McpPromptPanelProps {
  serverName?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}
const McpPromptPanel: FC<McpPromptPanelProps> = ({ serverName, open, onOpenChange }) => {
  const mcpStore = useMcpStore();
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [promptResult, setPromptResult] = useState("");
  const [promptParams, setPromptParams] = useState("{}");
  const [promptLoading, setPromptLoading] = useState(false);
  const [jsonPromptError, setJsonPromptError] = useState(false);
  const [isParametersExpanded, setIsParametersExpanded] = useState(false);
  const serverPrompts = serverName
    ? mcpStore.prompts.filter((prompt) => prompt.client.name === serverName)
    : mcpStore.prompts;
  const selectedPromptObj = serverPrompts.find((p) => p.name === selectedPrompt);
  const defaultPromptParams = (() => {
    if (!selectedPromptObj) return "{}";
    const promptArgs = selectedPromptObj.arguments || {};
    if (Array.isArray(promptArgs)) {
      const argsObject: Record<string, string> = {};
      for (const arg of promptArgs) {
        argsObject[arg.name] = "";
      }
      return JSON.stringify(argsObject, null, 2);
    }
    return JSON.stringify(promptArgs, null, 2);
  })();

  // Reset the prompt form whenever the dialog opens (adjusted during render so the
  // React Compiler can track it).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSelectedPrompt("");
      setPromptResult("");
      setPromptParams("{}");
      setIsParametersExpanded(false);
    }
  }

  // Sync the params draft when the selected prompt changes (not when the computed
  // defaults object is recomputed for the same prompt).
  const [syncedPrompt, setSyncedPrompt] = useState(selectedPrompt);
  if (syncedPrompt !== selectedPrompt) {
    setSyncedPrompt(selectedPrompt);
    setPromptParams(defaultPromptParams);
    setPromptResult("");
    setIsParametersExpanded(false);
  }
  const validatePromptJson = (input: string): boolean => {
    try {
      JSON.parse(input);
      setJsonPromptError(false);
      return true;
    } catch {
      setJsonPromptError(true);
      return false;
    }
  };
  const selectPrompt = (prompt: PromptListEntry) => {
    setSelectedPrompt(prompt.name);
  };
  const callPrompt = async (prompt: PromptListEntry) => {
    if (!prompt) return;
    if (!validatePromptJson(promptParams)) return;
    try {
      setPromptLoading(true);
      const params = JSON.parse(promptParams);
      const result = await mcpStore.getPrompt(prompt, params);
      if (result && typeof result === "object") {
        const typedResult = result as Record<string, unknown>;
        if ("messages" in typedResult) {
          setPromptResult(JSON.stringify(typedResult.messages, null, 2));
        } else {
          setPromptResult(JSON.stringify(typedResult, null, 2));
        }
      } else {
        setPromptResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error("Prompt call failed:", error);
      setPromptResult(`Call failed: ${error}`);
    }
    setPromptLoading(false);
  };
  const formatJson = (input: string): string => {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  };
  const formatPromptParams = () => {
    setPromptParams(formatJson(promptParams));
  };
  const promptArgsDescription = (() => {
    if (!selectedPromptObj) return [];
    const promptArgs = selectedPromptObj.arguments || {};
    if (Array.isArray(promptArgs)) {
      return promptArgs.map((arg) => ({
        name: arg.name,
        description: arg.description || "",
        required: arg.required || false,
      }));
    }
    return [];
  })();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-4/5 min-w-[80vw] max-w-[80vw] p-0 bg-white dark:bg-black h-screen flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b bg-card shrink-0">
          <SheetTitle className="flex items-center space-x-2">
            <Icon icon="lucide:message-square-text" className="h-5 w-5 text-primary" />
            <span>{serverName || ""}</span>
          </SheetTitle>
          <SheetDescription>View and test prompt templates</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="shrink-0 px-4 py-4 lg:hidden">
            <Select value={selectedPrompt} onValueChange={(v) => setSelectedPrompt(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a prompt" />
              </SelectTrigger>
              <SelectContent>
                {serverPrompts.map((prompt) => (
                  <SelectItem key={prompt.name} value={prompt.name}>
                    {prompt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="hidden lg:flex lg:w-1/3 lg:border-r lg:flex-col">
              <PromptListPane
                loading={mcpStore.toolsLoading}
                prompts={serverPrompts}
                selectedPrompt={selectedPrompt}
                onSelect={selectPrompt}
              />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden lg:w-2/3 min-h-0">
              {!selectedPromptObj && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                      <Icon icon="lucide:mouse-pointer-click" className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">Select a prompt</h3>
                  </div>
                </div>
              )}

              {selectedPromptObj && (
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-4 py-4 space-y-4 pb-8">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon icon="lucide:message-square-text" className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold">{selectedPromptObj.name}</h2>
                        </div>
                        <p className="text-sm text-secondary-foreground">
                          {selectedPromptObj.description || "No description"}
                        </p>
                      </div>

                      <PromptParametersCard
                        args={promptArgsDescription}
                        expanded={isParametersExpanded}
                        onToggle={() => setIsParametersExpanded(!isParametersExpanded)}
                      />

                      <PromptRunCard
                        params={promptParams}
                        jsonError={jsonPromptError}
                        loading={promptLoading}
                        defaultParams={defaultPromptParams}
                        onParamsChange={setPromptParams}
                        onValidateJson={validatePromptJson}
                        onFormat={formatPromptParams}
                        onRun={() => callPrompt(selectedPromptObj as PromptListEntry)}
                      />

                      {promptResult && <McpJsonViewer content={promptResult} title="Result" readonly />}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
interface PromptListPaneProps {
  loading: boolean;
  prompts: PromptListEntry[];
  selectedPrompt: string;
  onSelect: (prompt: PromptListEntry) => void;
}

/** Desktop sidebar list of available prompts for the selected server. */
function PromptListPane({ loading, prompts, selectedPrompt, onSelect }: PromptListPaneProps) {
  return (
    <ScrollArea className="flex-1 min-h-0">
      {loading && (
        <div className="flex justify-center py-8">
          <Icon icon="lucide:loader" className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && prompts.length === 0 && (
        <div className="text-center py-8">
          <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
            <Icon icon="lucide:message-square" className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No prompts available</p>
        </div>
      )}
      {!loading && prompts.length > 0 && (
        <div className="p-2 space-y-1">
          {prompts.map((prompt) => (
            <Button
              key={prompt.name}
              variant="ghost"
              className={[
                "w-full justify-start h-auto p-3 text-left",
                selectedPrompt === prompt.name ? "bg-accent text-accent-foreground" : "",
              ].join(" ")}
              onClick={() => onSelect(prompt)}
            >
              <div className="flex items-start space-x-2 w-full">
                <Icon icon="lucide:message-square-text" className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{prompt.name}</div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
interface PromptArgumentSummary {
  name: string;
  description: string;
  required: boolean;
}
interface PromptParametersCardProps {
  args: PromptArgumentSummary[];
  expanded: boolean;
  onToggle: () => void;
}

/** Collapsible card describing the selected prompt's arguments. */
function PromptParametersCard({ args, expanded, onToggle }: PromptParametersCardProps) {
  if (args.length === 0) return null;
  return (
    <div className="border rounded-lg">
      <Button variant="ghost" className="w-full justify-between p-3 h-auto" onClick={onToggle}>
        <span className="font-medium">Parameters ({args.length})</span>
        <Icon icon={expanded ? "lucide:chevron-up" : "lucide:chevron-down"} className="h-4 w-4" />
      </Button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {args.map((arg) => (
            <div key={arg.name} className="p-2 bg-muted/30 rounded-md border border-border/30">
              <div className="flex items-center space-x-1 mb-1">
                <code className="text-xs font-mono font-medium text-foreground">{arg.name}</code>
                {arg.required && (
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    Required
                  </Badge>
                )}
              </div>
              {arg.description && <p className="text-xs text-muted-foreground">{arg.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
interface PromptRunCardProps {
  params: string;
  jsonError: boolean;
  loading: boolean;
  defaultParams: string;
  onParamsChange: (value: string) => void;
  onValidateJson: (input: string) => boolean;
  onFormat: () => void;
  onRun: () => void;
}

/** JSON parameter editor with reset/format actions and the execute button. */
function PromptRunCard({
  params,
  jsonError,
  loading,
  defaultParams,
  onParamsChange,
  onValidateJson,
  onFormat,
  onRun,
}: PromptRunCardProps) {
  const formatJson = (input: string): string => {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Input</h3>
        <div className="flex space-x-2">
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onParamsChange(defaultParams)}>
            <Icon icon="lucide:refresh-cw" className="mr-1 h-3 w-3" /> Reset
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={onFormat}>
            <Icon icon="lucide:align-left" className="mr-1 h-3 w-3" /> Format
          </Button>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={params}
          onChange={(e) => {
            onParamsChange(e.target.value);
            onValidateJson(e.target.value);
          }}
          onBlur={() => onParamsChange(formatJson(params))}
          aria-label="Prompt parameters (JSON)"
          className={[
            "flex h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            jsonError ? "border-destructive" : "",
          ].join(" ")}
          placeholder="{}"
        />
        {jsonError && <div className="absolute right-3 top-3 text-xs text-destructive">Invalid JSON</div>}
      </div>
      <p className="text-xs text-muted-foreground">Enter parameters as JSON</p>

      <Button className="w-full" disabled={loading || jsonError} onClick={onRun}>
        {loading ? (
          <Icon icon="lucide:loader" className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icon icon="lucide:play" className="mr-2 h-4 w-4" />
        )}
        {loading ? "Running..." : "Execute"}
      </Button>
    </div>
  );
}
export default McpPromptPanel;
