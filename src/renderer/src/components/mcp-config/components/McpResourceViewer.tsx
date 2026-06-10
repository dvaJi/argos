import { type FC, useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@shadcn/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { useMcpStore } from "@/stores/mcp";
import McpJsonViewer from "./McpJsonViewer";
import type { ResourceListEntry } from "@shared/presenter";

interface McpResourceViewerProps {
  serverName?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

const getResourceIcon = (uri: string) => {
  if (uri.endsWith(".json")) return "lucide:file-json";
  if (uri.endsWith(".txt")) return "lucide:file-text";
  if (uri.endsWith(".md")) return "lucide:file-text";
  if (uri.endsWith(".csv")) return "lucide:file-spreadsheet";
  if (uri.endsWith(".xml")) return "lucide:file-code";
  if (uri.startsWith("http")) return "lucide:globe";
  return "lucide:file";
};

const getResourceType = (uri: string) => {
  if (uri.endsWith(".json")) return "JSON";
  if (uri.endsWith(".txt")) return "Text";
  if (uri.endsWith(".md")) return "Markdown";
  if (uri.endsWith(".csv")) return "CSV";
  if (uri.endsWith(".xml")) return "XML";
  if (uri.startsWith("http")) return "URL";
  return "File";
};

export const McpResourceViewer: FC<McpResourceViewerProps> = ({ serverName, open, onOpenChange }) => {
  const mcpStore = useMcpStore();

  const [selectedResource, setSelectedResource] = useState("");
  const [resourceContent, setResourceContent] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);

  const serverResources = useMemo(
    () =>
      serverName ? mcpStore.resources.filter((resource) => resource.client.name === serverName) : mcpStore.resources,
    [mcpStore.resources, serverName],
  );

  useEffect(() => {
    if (open) {
      setSelectedResource("");
      setResourceContent("");
    }
  }, [open]);

  useEffect(() => {
    setResourceContent("");
  }, [selectedResource]);

  const selectResource = (resource: ResourceListEntry) => {
    setSelectedResource(resource.uri);
  };

  const loadResourceContent = async (resource: ResourceListEntry) => {
    if (!resource) return;
    try {
      setResourceLoading(true);
      const result = await mcpStore.readResource(resource);
      if (result && typeof result === "object") {
        if ("text" in result && result.text) {
          setResourceContent(result.text);
        } else if ("content" in result) {
          const typedResult = result as { content: unknown };
          setResourceContent(
            typeof typedResult.content === "string"
              ? typedResult.content
              : JSON.stringify(typedResult.content, null, 2),
          );
        } else {
          setResourceContent(JSON.stringify(result, null, 2));
        }
      } else {
        setResourceContent(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error("Load resource failed:", error);
      setResourceContent(`Load failed: ${error}`);
    } finally {
      setResourceLoading(false);
    }
  };

  const selectedResourceObj = useMemo(
    () => serverResources.find((r) => r.uri === selectedResource),
    [serverResources, selectedResource],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-4/5 min-w-[80vw] max-w-[80vw] p-0 bg-white dark:bg-black h-screen flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b bg-card shrink-0">
          <SheetTitle className="flex items-center space-x-2">
            <Icon icon="lucide:folder" className="h-5 w-5 text-primary" />
            <span>{serverName ? `${serverName} Resources` : "MCP Resources"}</span>
          </SheetTitle>
          <SheetDescription>Browse and inspect MCP resources</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="shrink-0 px-4 py-4 lg:hidden">
            <Select value={selectedResource} onValueChange={setSelectedResource}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a resource" />
              </SelectTrigger>
              <SelectContent>
                {serverResources.map((resource) => (
                  <SelectItem key={resource.uri} value={resource.uri}>
                    {resource.name || resource.uri}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="hidden lg:flex lg:w-1/3 lg:border-r lg:flex-col">
              <ScrollArea className="flex-1 min-h-0">
                {mcpStore.toolsLoading && (
                  <div className="flex justify-center py-8">
                    <Icon icon="lucide:loader" className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!mcpStore.toolsLoading && serverResources.length === 0 && (
                  <div className="text-center py-8">
                    <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                      <Icon icon="lucide:folder" className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No resources available</p>
                  </div>
                )}
                {!mcpStore.toolsLoading && serverResources.length > 0 && (
                  <div className="p-2 space-y-1">
                    {serverResources.map((resource) => (
                      <Button
                        key={resource.uri}
                        variant="ghost"
                        className={[
                          "w-full justify-start h-auto p-3 text-left",
                          selectedResource === resource.uri ? "bg-accent text-accent-foreground" : "",
                        ].join(" ")}
                        onClick={() => selectResource(resource)}
                      >
                        <div className="flex items-start space-x-2 w-full">
                          <Icon icon={getResourceIcon(resource.uri)} className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{resource.name || resource.uri}</div>
                            <div className="text-xs text-muted-foreground truncate mt-1">{resource.uri}</div>
                            <div className="flex items-center mt-2 space-x-1">
                              <Badge variant="outline" className="text-xs">
                                {resource.client.name}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {getResourceType(resource.uri)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden lg:w-2/3 min-h-0">
              {!selectedResourceObj && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                      <Icon icon="lucide:mouse-pointer-click" className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">Select a resource</h3>
                  </div>
                </div>
              )}

              {selectedResourceObj && (
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-4 py-4 space-y-4 pb-8">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Icon icon={getResourceIcon(selectedResourceObj.uri)} className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold">
                            {selectedResourceObj.name || selectedResourceObj.uri}
                          </h2>
                        </div>
                        <div className="flex items-center mt-2 space-x-2">
                          <Badge variant="outline">{selectedResourceObj.client.name}</Badge>
                          <Badge variant="secondary">{getResourceType(selectedResourceObj.uri)}</Badge>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-foreground">Resource URI</h3>
                        <div className="p-2 bg-muted/30 rounded-md border border-border/30">
                          <code className="text-xs font-mono text-foreground break-all">{selectedResourceObj.uri}</code>
                        </div>
                      </div>

                      <div>
                        <Button
                          className="w-full"
                          disabled={resourceLoading}
                          onClick={() => loadResourceContent(selectedResourceObj as ResourceListEntry)}
                        >
                          {resourceLoading ? (
                            <Icon icon="lucide:loader" className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Icon icon="lucide:download" className="mr-2 h-4 w-4" />
                          )}
                          {resourceLoading ? "Loading..." : "Load Content"}
                        </Button>
                      </div>

                      {(resourceContent || resourceLoading) && (
                        <McpJsonViewer
                          content={resourceContent}
                          loading={resourceLoading}
                          title="Resource Content"
                          readonly
                        />
                      )}

                      {!resourceContent && !resourceLoading && (
                        <div className="text-center py-12">
                          <div className="mx-auto w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mb-4">
                            <Icon icon="lucide:file-text" className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium text-foreground mb-2">No content loaded</h3>
                          <p className="text-xs text-muted-foreground">Click "Load Content" to view the resource</p>
                        </div>
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

export default McpResourceViewer;
