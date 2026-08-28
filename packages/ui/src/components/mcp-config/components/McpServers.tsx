import { type ReactNode, useState, useEffect, useMemo, useCallback, useImperativeHandle, forwardRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "#shadcn/components/ui/dialog";
import { Badge } from "#shadcn/components/ui/badge";
import { Input } from "#shadcn/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#shadcn/components/ui/sheet";
import { useMcpStore } from "#/stores/mcp";
import { useToast } from "#/components/use-toast";
import { useNavigate } from "@tanstack/react-router";
import McpServerCard from "./McpServerCard";
import McpServerForm from "../mcpServerForm";
import McpToolPanel from "./McpToolPanel";
import McpPromptPanel from "./McpPromptPanel";
import McpResourceViewer from "./McpResourceViewer";
import type { MCPServerConfig } from "@argos/shared/presenter";

interface McpServersProps {
  showFooterAddButton?: boolean;
  statusBar?: ReactNode;
  footerActionsAfter?: ReactNode;
}

export interface McpServersRef {
  openAddServerDialog: () => void;
}

const MCP_FILTERS = ["all", "running", "stopped"] as const;
type McpFilter = (typeof MCP_FILTERS)[number];

export const McpServers = forwardRef<McpServersRef, McpServersProps>(
  ({ showFooterAddButton = true, statusBar, footerActionsAfter }, ref) => {
    const mcpStore = useMcpStore();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [isAddServerDialogOpen, setIsAddServerDialogOpen] = useState(false);
    const [isEditServerDialogOpen, setIsEditServerDialogOpen] = useState(false);
    const [isRemoveConfirmDialogOpen, setIsRemoveConfirmDialogOpen] = useState(false);
    const [isToolPanelOpen, setIsToolPanelOpen] = useState(false);
    const [isPromptPanelOpen, setIsPromptPanelOpen] = useState(false);
    const [isResourceViewerOpen, setIsResourceViewerOpen] = useState(false);
    const [selectedServer, setSelectedServer] = useState("");
    const [selectedServerForTools, setSelectedServerForTools] = useState("");
    const [selectedServerForPrompts, setSelectedServerForPrompts] = useState("");
    const [selectedServerForResources, setSelectedServerForResources] = useState("");
    const [selectedDetailServerName, setSelectedDetailServerName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<McpFilter>("all");

    useEffect(() => {
      if (!mcpStore.mcpInstallCache) return;
      void Promise.resolve().then(() => setIsAddServerDialogOpen(true));
    }, [mcpStore.mcpInstallCache]);

    useEffect(() => {
      if (isAddServerDialogOpen) return;
      if (!mcpStore.mcpInstallCache) return;
      mcpStore.clearMcpInstallCache();
    }, [isAddServerDialogOpen, mcpStore]);

    const isArgosManagedServer = (config?: MCPServerConfig) => config?.source === "argos";

    const isBuiltInServer = (serverName: string) => {
      const config = mcpStore.config.mcpServers[serverName];
      return config?.type === "inmemory" || isArgosManagedServer(config);
    };

    const filteredServers = useMemo(() => {
      const query = searchQuery.trim().toLowerCase();
      return mcpStore.serverList.filter((server) => {
        const matchesQuery =
          !query || server.name.toLowerCase().includes(query) || server.descriptions?.toLowerCase().includes(query);
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "running" && server.isRunning) ||
          (activeFilter === "stopped" && !server.isRunning);
        return matchesQuery && matchesFilter;
      });
    }, [searchQuery, activeFilter, mcpStore.serverList]);

    const selectedDetailServer = useMemo(
      () => mcpStore.serverList.find((server) => server.name === selectedDetailServerName),
      [mcpStore.serverList, selectedDetailServerName],
    );

    const getServerToolsCount = (serverName: string) =>
      mcpStore.getVisibleTools().filter((tool) => tool.server.name === serverName).length;

    const getServerPromptsCount = (serverName: string) =>
      mcpStore.getVisiblePrompts().filter((prompt) => prompt.client.name === serverName).length;

    const getServerResourcesCount = (serverName: string) =>
      mcpStore.getVisibleResources().filter((resource) => resource.client.name === serverName).length;

    const handleAddServer = async (serverName: string, serverConfig: MCPServerConfig) => {
      const result = await mcpStore.addServer(serverName, serverConfig);
      if (result.success) setIsAddServerDialogOpen(false);
    };

    const openAddServerDialog = () => setIsAddServerDialogOpen(true);

    useImperativeHandle(ref, () => ({ openAddServerDialog }));

    const handleEditServer = async (serverName: string, serverConfig: Partial<MCPServerConfig>) => {
      const success = await mcpStore.updateServer(serverName, serverConfig);
      if (success) {
        setIsEditServerDialogOpen(false);
        setSelectedServer("");
      }
    };

    const handleRemoveServer = async (serverName: string) => {
      const config = mcpStore.config.mcpServers[serverName];
      if (config?.type === "inmemory" || isArgosManagedServer(config)) {
        toast({
          title: "Cannot Remove",
          description: "Built-in servers cannot be removed",
          variant: "destructive",
        });
        return;
      }
      setSelectedServer(serverName);
      setIsRemoveConfirmDialogOpen(true);
    };

    const confirmRemoveServer = async () => {
      await mcpStore.removeServer(selectedServer);
      setIsRemoveConfirmDialogOpen(false);
    };

    const handleToggleServer = async (serverName: string) => {
      const config = mcpStore.config.mcpServers[serverName];
      if (isArgosManagedServer(config)) {
        toast({ title: "Read Only", description: "Managed servers are read-only" });
        return;
      }
      if (mcpStore.serverLoadingStates[serverName]) return;
      const success = await mcpStore.toggleServer(serverName);
      if (!success) {
        const message = mcpStore.getServerError(serverName) || "The server lifecycle request failed";
        toast({ title: "Operation Failed", description: message, variant: "destructive" });
      }
    };

    const handleRuntimeToggle = async (serverName: string, isRunning: boolean) => {
      const result = await mcpStore.setServerRunning(serverName, !isRunning);
      if (!result.success) {
        toast({
          title: isRunning ? "Could not stop server" : "Could not start server",
          description: result.error || "The server lifecycle request failed",
          variant: "destructive",
        });
      }
    };

    const openEditServerDialog = (serverName: string) => {
      const specialServers: Record<string, string> = {
        difyKnowledge: "dify",
        ragflowKnowledge: "ragflow",
        fastGptKnowledge: "fastgpt",
        builtinKnowledge: "builtinKnowledge",
      };
      if (specialServers[serverName]) {
        window.location.assign(`/settings/knowledge-base?subtab=${specialServers[serverName]}`);
        return;
      }
      const config = mcpStore.config.mcpServers[serverName];
      if (isArgosManagedServer(config)) {
        toast({ title: "Read Only", description: "Managed servers are read-only" });
        return;
      }
      setSelectedServer(serverName);
      setIsEditServerDialogOpen(true);
    };

    const handleViewTools = async (serverName: string) => {
      setSelectedServerForTools(serverName);
      await mcpStore.loadTools();
      setIsToolPanelOpen(true);
    };

    const handleViewPrompts = async (serverName: string) => {
      setSelectedServerForPrompts(serverName);
      await mcpStore.loadPrompts();
      setIsPromptPanelOpen(true);
    };

    const handleViewResources = async (serverName: string) => {
      setSelectedServerForResources(serverName);
      await mcpStore.loadResources();
      setIsResourceViewerOpen(true);
    };

    const closeDetail = (open: boolean) => {
      if (!open) setSelectedDetailServerName("");
    };

    return (
      <div className="h-full min-h-0 flex flex-col">
        <ScrollArea className="min-h-0 flex-1 px-3">
          {mcpStore.configLoading && (
            <div className="flex justify-center py-8">
              <div className="text-center">
                <Icon icon="lucide:loader" className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}

          {!mcpStore.configLoading && mcpStore.serverList.length === 0 && (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mb-3">
                <Icon icon="lucide:server-off" className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2">No Servers Found</h3>
              <p className="text-xs text-muted-foreground mb-3 px-4">Add an MCP server to get started</p>
            </div>
          )}

          {!mcpStore.configLoading && mcpStore.serverList.length > 0 && (
            <div className="flex flex-col gap-3 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="lg:max-w-sm"
                  placeholder="Search servers..."
                />
                <div className="flex flex-wrap gap-2">
                  {MCP_FILTERS.map((filter) => (
                    <Button
                      key={filter}
                      size="sm"
                      variant={activeFilter === filter ? "default" : "outline"}
                      onClick={() => setActiveFilter(filter)}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredServers.map((server) => (
                  <McpServerCard
                    key={server.name}
                    server={server}
                    isBuiltIn={isBuiltInServer(server.name)}
                    isManaged={mcpStore.config.mcpServers[server.name]?.source === "argos"}
                    isLoading={mcpStore.serverLoadingStates[server.name]}
                    disabled={mcpStore.configLoading}
                    toolsCount={getServerToolsCount(server.name)}
                    promptsCount={getServerPromptsCount(server.name)}
                    resourcesCount={getServerResourcesCount(server.name)}
                    onClick={() => setSelectedDetailServerName(server.name)}
                    onToggle={() => handleToggleServer(server.name)}
                    onRuntimeToggle={() => handleRuntimeToggle(server.name, server.isRunning)}
                    onEdit={() => openEditServerDialog(server.name)}
                    onRemove={() => handleRemoveServer(server.name)}
                    onViewTools={() => handleViewTools(server.name)}
                    onViewPrompts={() => handleViewPrompts(server.name)}
                    onViewResources={() => handleViewResources(server.name)}
                  />
                ))}
              </div>

              {filteredServers.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No results</div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 border-t bg-background">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {statusBar || (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1">
                    <Icon icon="lucide:server" className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total: {mcpStore.serverList.length}</span>
                  </div>
                  {mcpStore.serverList.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <Icon icon="lucide:play" className="h-3 w-3 text-green-600" />
                      <span className="text-xs text-green-600">
                        {mcpStore.serverList.filter((s) => s.isRunning).length}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <Dialog open={isAddServerDialogOpen} onOpenChange={setIsAddServerDialogOpen}>
                {showFooterAddButton && (
                  <DialogTrigger render={<Button size="sm" className="h-8 px-3 text-xs" />}>
                    <Icon icon="lucide:plus" className="mr-1.5 h-3 w-3" />
                    Add
                  </DialogTrigger>
                )}
                <DialogContent className="w-[95vw] max-w-[500px] px-0 h-[85vh] max-h-[500px] flex flex-col">
                  <DialogHeader className="px-3 shrink-0 pb-2">
                    <DialogTitle className="text-base">Add MCP Server</DialogTitle>
                    <DialogDescription className="text-sm">Configure a new MCP server</DialogDescription>
                  </DialogHeader>
                  <McpServerForm defaultJsonConfig={mcpStore.mcpInstallCache || undefined} onSubmit={handleAddServer} />
                </DialogContent>
              </Dialog>
              {footerActionsAfter}
            </div>
          </div>
        </div>

        <Sheet open={Boolean(selectedDetailServer)} onOpenChange={closeDetail}>
          <SheetContent className="flex w-full flex-col sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>{selectedDetailServer?.name}</SheetTitle>
              <SheetDescription>{selectedDetailServer?.descriptions}</SheetDescription>
            </SheetHeader>
            {selectedDetailServer && (
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{selectedDetailServer.isRunning ? "Running" : "Stopped"}</Badge>
                  <Badge variant="outline">{isBuiltInServer(selectedDetailServer.name) ? "Built-in" : "Custom"}</Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    variant="outline"
                    disabled={getServerToolsCount(selectedDetailServer.name) === 0}
                    onClick={() => handleViewTools(selectedDetailServer.name)}
                  >
                    <Icon icon="lucide:wrench" className="size-4" />
                    {getServerToolsCount(selectedDetailServer.name)}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={getServerPromptsCount(selectedDetailServer.name) === 0}
                    onClick={() => handleViewPrompts(selectedDetailServer.name)}
                  >
                    <Icon icon="lucide:message-square-quote" className="size-4" />
                    {getServerPromptsCount(selectedDetailServer.name)}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={getServerResourcesCount(selectedDetailServer.name) === 0}
                    onClick={() => handleViewResources(selectedDetailServer.name)}
                  >
                    <Icon icon="lucide:folder" className="size-4" />
                    {getServerResourcesCount(selectedDetailServer.name)}
                  </Button>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground">Command</div>
                  <div className="mt-1 break-all font-mono text-xs">{selectedDetailServer.command || "-"}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openEditServerDialog(selectedDetailServer.name)}>
                    <Icon icon="lucide:settings" className="size-4" /> Edit
                  </Button>
                  {!isBuiltInServer(selectedDetailServer.name) && (
                    <Button variant="destructive" onClick={() => handleRemoveServer(selectedDetailServer.name)}>
                      <Icon icon="lucide:trash-2" className="size-4" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={isEditServerDialogOpen} onOpenChange={setIsEditServerDialogOpen}>
          <DialogContent className="w-[95vw] max-w-[500px] px-0 h-[85vh] max-h-[500px] flex flex-col">
            <DialogHeader className="px-3 shrink-0 pb-2">
              <DialogTitle className="text-base">Edit MCP Server</DialogTitle>
              <DialogDescription className="text-sm">Modify server configuration</DialogDescription>
            </DialogHeader>
            {selectedServer && mcpStore.config.mcpServers[selectedServer] && (
              <McpServerForm
                serverName={selectedServer}
                initialConfig={mcpStore.config.mcpServers[selectedServer]}
                editMode={true}
                onSubmit={(name, config) => handleEditServer(name, config)}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isRemoveConfirmDialogOpen} onOpenChange={setIsRemoveConfirmDialogOpen}>
          <DialogContent className="w-[90vw] max-w-[380px]">
            <DialogHeader>
              <DialogTitle className="text-base">Remove Server</DialogTitle>
              <DialogDescription className="text-sm">
                Are you sure you want to remove "{selectedServer}"?
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex flex-row items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                className="min-w-24"
                onClick={() => setIsRemoveConfirmDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" size="sm" className="min-w-24" onClick={confirmRemoveServer}>
                Confirm
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <McpToolPanel open={isToolPanelOpen} onOpenChange={setIsToolPanelOpen} serverName={selectedServerForTools} />
        <McpPromptPanel
          open={isPromptPanelOpen}
          onOpenChange={setIsPromptPanelOpen}
          serverName={selectedServerForPrompts}
        />
        <McpResourceViewer
          open={isResourceViewerOpen}
          onOpenChange={setIsResourceViewerOpen}
          serverName={selectedServerForResources}
        />
      </div>
    );
  },
);

McpServers.displayName = "McpServers";
