import { type FC, useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "#shadcn/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { useMcpStore, mcpStore as mcpStoreInstance } from "#/stores/mcp";
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
import McpJsonViewer from "./McpJsonViewer";
import type { MCPToolDefinition } from "@argos/shared/presenter";
interface McpToolPanelProps {
  serverName: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}
const McpToolPanel: FC<McpToolPanelProps> = ({ serverName, open, onOpenChange }) => {
  const mcpStore = useMcpStore();
  const [selectedToolName, setSelectedToolName] = useState("");
  const [localToolInputs, setLocalToolInputs] = useState<Record<string, string>>({});
  const [localToolResults, setLocalToolResults] = useState<Record<string, string>>({});
  const [jsonError, setJsonError] = useState<Record<string, boolean>>({});
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isParametersExpanded, setIsParametersExpanded] = useState(false);
  const serverTools = mcpStore.tools.filter((tool) => tool.server.name === serverName);
  const selectedTool = selectedToolName
    ? (serverTools.find((t) => t.function.name === selectedToolName) ?? null)
    : null;
  const isLgScreen = useMediaQuery("(min-width: 1024px)");
  const showTopSelector = !isLgScreen || serverTools.length === 0;

  // Reset the selection whenever the panel is (re)opened — adjusted during render.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setSelectedToolName("");
  }

  // Re-run the per-tool reset whenever the selected tool changes — adjusted during render.
  const [lastSelectedToolName, setLastSelectedToolName] = useState(selectedToolName);
  if (lastSelectedToolName !== selectedToolName) {
    setLastSelectedToolName(selectedToolName);
    if (selectedToolName) {
      if (!localToolInputs[selectedToolName]) {
        setLocalToolInputs((prev) => ({
          ...prev,
          [selectedToolName]: "{}",
        }));
      }
      setJsonError((prev) => ({
        ...prev,
        [selectedToolName]: false,
      }));
      setIsDescriptionExpanded(false);
      setIsParametersExpanded(false);
    }
  }
  const validateJson = (input: string, toolName: string): boolean => {
    try {
      JSON.parse(input);
      setJsonError((prev) => ({
        ...prev,
        [toolName]: false,
      }));
      return true;
    } catch {
      setJsonError((prev) => ({
        ...prev,
        [toolName]: true,
      }));
      return false;
    }
  };
  const handleToolInputChange = (toolName: string, value: string) => {
    setLocalToolInputs((prev) => ({
      ...prev,
      [toolName]: value,
    }));
    validateJson(value, toolName);
  };
  const callTool = async (toolName: string) => {
    if (!validateJson(localToolInputs[toolName], toolName)) return;
    try {
      const params = JSON.parse(localToolInputs[toolName]);
      mcpStoreInstance.setState((s) => ({
        ...s,
        toolInputs: {
          ...s.toolInputs,
          [toolName]: params,
        },
      }));
      const result = await mcpStore.callTool(toolName);
      if (result) {
        setLocalToolResults((prev) => ({
          ...prev,
          [toolName]: result.content || "",
        }));
      }
      return result;
    } catch (error) {
      console.error("Tool call error:", error);
      setLocalToolResults((prev) => ({
        ...prev,
        [toolName]: String(error),
      }));
      return;
    }
  };
  const formatToolInput = (toolName: string) => {
    try {
      const formatted = JSON.stringify(JSON.parse(localToolInputs[toolName]), null, 2);
      setLocalToolInputs((prev) => ({
        ...prev,
        [toolName]: formatted,
      }));
    } catch {}
  };
  const toolParametersDescription = (() => {
    if (!selectedTool?.function.parameters?.properties) return [];
    const properties = selectedTool.function.parameters.properties;
    const required = selectedTool.function.parameters.required || [];
    const requiredSet = new Set(required);
    return Object.entries(properties).map(([key, prop]) => ({
      name: key,
      description: prop.description || "",
      type: prop.enum ? "enum" : prop.type === "array" && prop.items?.enum ? "array[enum]" : prop.type || "unknown",
      originalType: prop.type || "unknown",
      required: requiredSet.has(key),
      annotations: prop.annotations,
      enum: prop.enum || null,
      items: prop.items || null,
    }));
  })();
  const selectTool = (tool: MCPToolDefinition) => {
    setSelectedToolName(tool.function.name);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-4/5 min-w-[80vw] max-w-[80vw] p-0 bg-white dark:bg-black h-screen flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b bg-card shrink-0 window-no-drag-region">
          <SheetTitle className="flex items-center space-x-2">
            <Icon icon="lucide:wrench" className="h-5 w-5 text-primary" />
            <span>Tools - {serverName}</span>
          </SheetTitle>
          <SheetDescription>Debug and test MCP tools</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {showTopSelector && (
            <div className="shrink-0 px-4 py-4">
              <McpToolTopSelect tools={serverTools} value={selectedToolName} onValueChange={setSelectedToolName} />
            </div>
          )}

          <div className="flex-1 flex overflow-hidden min-h-0">
            {!showTopSelector && (
              <McpToolListPanel tools={serverTools} selectedToolName={selectedToolName} onSelect={selectTool} />
            )}

            <div className="flex-1 flex flex-col overflow-hidden lg:w-2/3 min-h-0">
              {!selectedTool && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                      <Icon icon="lucide:mouse-pointer-click" className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">Select a tool to debug</h3>
                  </div>
                </div>
              )}

              {selectedTool && (
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-4 py-4 space-y-4 pb-8">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon icon="lucide:function-square" className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold">Function Description</h2>
                        </div>
                        <p className="text-sm text-secondary-foreground">
                          {selectedTool.function.description || selectedTool.function.name}
                        </p>
                      </div>

                      {toolParametersDescription.length > 0 && (
                        <McpToolParametersSection
                          parameters={toolParametersDescription}
                          expanded={isParametersExpanded}
                          onToggle={() => setIsParametersExpanded(!isParametersExpanded)}
                        />
                      )}

                      <McpToolInputSection
                        toolName={selectedTool.function.name}
                        value={localToolInputs[selectedTool.function.name] || "{}"}
                        hasJsonError={Boolean(jsonError[selectedTool.function.name])}
                        loading={Boolean(mcpStore.toolLoadingStates[selectedTool.function.name])}
                        onValueChange={handleToolInputChange}
                        onFormat={formatToolInput}
                        onCall={callTool}
                      />

                      {localToolResults[selectedTool.function.name] && (
                        <McpJsonViewer content={localToolResults[selectedTool.function.name]} title="Result" readonly />
                      )}
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
type McpToolParameterDescription = {
  name: string;
  description: string;
  type: string;
  originalType: string;
  required: boolean;
  annotations: unknown;
  enum: string[] | null;
  items: {
    type?: string;
    enum?: string[];
  } | null;
};

const McpToolTopSelect = ({
  tools,
  value,
  onValueChange,
}: {
  tools: MCPToolDefinition[];
  value: string;
  onValueChange: (value: string) => void;
}) => (
  <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Select a tool to debug" />
    </SelectTrigger>
    <SelectContent>
      {tools.map((tool) => (
        <SelectItem key={tool.function.name} value={tool.function.name}>
          <div className="flex items-center space-x-2">
            <Icon icon="lucide:function-square" className="h-3 w-3 text-primary" />
            <span>{tool.function.name}</span>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const McpToolListPanel = ({
  tools,
  selectedToolName,
  onSelect,
}: {
  tools: MCPToolDefinition[];
  selectedToolName: string;
  onSelect: (tool: MCPToolDefinition) => void;
}) => (
  <div className="flex w-1/3 border-r flex-col">
    <div className="p-4 border-b shrink-0">
      <h3 className="text-sm font-medium text-foreground">Tool List</h3>
    </div>
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-2 space-y-1">
        {tools.map((tool) => (
          <Button
            key={tool.function.name}
            variant="ghost"
            className={[
              "w-full justify-start h-auto p-3 text-left",
              selectedToolName === tool.function.name ? "bg-accent text-accent-foreground" : "",
            ].join(" ")}
            onClick={() => onSelect(tool)}
          >
            <div className="flex items-start space-x-2 w-full">
              <Icon icon="lucide:function-square" className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{tool.function.name}</div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </ScrollArea>
  </div>
);

const McpToolParametersSection = ({
  parameters,
  expanded,
  onToggle,
}: {
  parameters: McpToolParameterDescription[];
  expanded: boolean;
  onToggle: () => void;
}) => (
  <div className="border rounded-lg">
    <Button variant="ghost" className="w-full justify-between p-3 h-auto" onClick={onToggle}>
      <span className="font-medium">Parameters ({parameters.length})</span>
      <Icon icon={expanded ? "lucide:chevron-up" : "lucide:chevron-down"} className="h-4 w-4" />
    </Button>
    {expanded && (
      <div className="px-3 pb-3 space-y-2">
        {parameters.map((param) => (
          <div key={param.name} className="p-2 bg-muted/30 rounded-md border border-border/30">
            <div className="flex items-center space-x-1 mb-1">
              <code className="text-xs font-mono font-medium text-foreground">{param.name}</code>
              {param.required && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  Required
                </Badge>
              )}
              <Badge
                variant={param.type === "enum" || param.type === "array[enum]" ? "default" : "outline"}
                className={[
                  "text-xs px-1 py-0",
                  param.type === "enum" || param.type === "array[enum]" ? "bg-blue-500 text-white" : "",
                ].join(" ")}
              >
                {param.type === "enum"
                  ? `enum(${param.originalType})`
                  : param.type === "array[enum]"
                    ? `array[enum(${param.items?.type || "string"})]`
                    : param.type}
              </Badge>
            </div>
            {param.description && <p className="text-xs text-muted-foreground">{param.description}</p>}
            {param.enum && param.enum.length > 0 && (
              <div className="mt-1">
                <p className="text-xs font-medium text-foreground mb-1">Allowed values:</p>
                <div className="flex flex-wrap gap-1">
                  {param.enum.map((enumValue) => (
                    <Badge key={enumValue} variant="secondary" className="text-xs px-1.5 py-0.5 font-mono">
                      {enumValue}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

const McpToolInputSection = ({
  toolName,
  value,
  hasJsonError,
  loading,
  onValueChange,
  onFormat,
  onCall,
}: {
  toolName: string;
  value: string;
  hasJsonError: boolean;
  loading: boolean;
  onValueChange: (toolName: string, value: string) => void;
  onFormat: (toolName: string) => void;
  onCall: (toolName: string) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-foreground">Input</h3>
      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onFormat(toolName)}>
        <Icon icon="lucide:align-left" className="mr-1 h-3 w-3" />
        Format
      </Button>
    </div>

    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onValueChange(toolName, e.target.value)}
        aria-label="Tool input parameters (JSON)"
        className={[
          "flex h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          hasJsonError ? "border-destructive" : "",
        ].join(" ")}
        placeholder="{}"
      />
      {hasJsonError && <div className="absolute right-3 top-3 text-xs text-destructive">Invalid JSON</div>}
    </div>
    <p className="text-xs text-muted-foreground">Enter JSON parameters for the tool</p>

    <Button className="w-full" disabled={loading || hasJsonError} onClick={() => onCall(toolName)}>
      {loading ? (
        <Icon icon="lucide:loader" className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icon icon="lucide:play" className="mr-2 h-4 w-4" />
      )}
      {loading ? "Running..." : "Execute"}
    </Button>
  </div>
);

export default McpToolPanel;
