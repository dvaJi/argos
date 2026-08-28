import { useState, useEffect, useMemo, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Switch } from "#shadcn/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { Collapsible, CollapsibleContent } from "#shadcn/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { useMcpStore, mcpStore as mcpStoreInstance } from "#/stores/mcp";
import { useToast } from "#/components/use-toast";
import ragflowPng from "#/assets/images/ragflow.png";

interface RagflowConfig {
  description: string;
  apiKey: string;
  datasetIds: string[];
  endpoint: string;
  enabled?: boolean;
}

interface EditingConfig extends Omit<RagflowConfig, "datasetIds"> {
  datasetIdsStr: string;
}

const RagflowKnowledgeSettings = () => {
  const mcpStore = useMcpStore();
  const { toast } = useToast();

  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configs, setConfigs] = useState<RagflowConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<EditingConfig>({
    description: "",
    apiKey: "",
    datasetIdsStr: "",
    endpoint: "http://localhost",
    enabled: true,
  });
  const editingIndexRef = useRef(-1);

  const isValid = useMemo(
    () =>
      editingConfig.apiKey.trim() !== "" &&
      editingConfig.datasetIdsStr.trim() !== "" &&
      editingConfig.description.trim() !== "",
    [editingConfig],
  );

  const isMcpEnabled = useMemo(() => mcpStore.serverStatuses["ragflowKnowledge"] || false, [mcpStore.serverStatuses]);
  const configReady = mcpStore.config.ready;
  const mcpEnabled = mcpStore.mcpEnabled;
  const { toggleServer } = mcpStore;

  const openAddConfig = () => {
    setIsEditing(false);
    editingIndexRef.current = -1;
    setEditingConfig({
      description: "",
      apiKey: "",
      datasetIdsStr: "",
      endpoint: "http://localhost",
      enabled: true,
    });
    setIsConfigDialogOpen(true);
  };

  const editConfig = (index: number) => {
    const config = configs[index];
    setIsEditing(true);
    editingIndexRef.current = index;
    setEditingConfig({ ...config, datasetIdsStr: config.datasetIds.join(",") });
    setIsConfigDialogOpen(true);
  };

  const closeDialog = () => {
    setIsConfigDialogOpen(false);
    editingIndexRef.current = -1;
  };

  const saveConfig = async () => {
    if (!isValid) return;
    const datasetIds = editingConfig.datasetIdsStr
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const config: RagflowConfig = {
      description: editingConfig.description,
      apiKey: editingConfig.apiKey,
      datasetIds,
      endpoint: editingConfig.endpoint,
      enabled: editingConfig.enabled,
    };
    if (isEditing && editingIndexRef.current !== -1) {
      setConfigs((prev) => prev.map((prevConfig, index) => (index === editingIndexRef.current ? config : prevConfig)));
    } else {
      setConfigs((prev) => [...prev, config]);
    }
    await updateToMcp();
    closeDialog();
  };

  const removeConfig = async (index: number) => {
    setConfigs((prev) => prev.filter((_, i) => i !== index));
    await updateToMcp();
  };

  const toggleConfigEnabled = async (index: number, enabled: boolean) => {
    setConfigs((prev) => prev.map((config, i) => (i === index ? { ...config, enabled } : config)));
    await updateToMcp();
  };

  const updateToMcp = async () => {
    try {
      await mcpStore.updateServer("ragflowKnowledge", { env: { configs } });
    } catch {}
  };

  const toggleMcpServer = async () => {
    if (!mcpStore.mcpEnabled) return;
    await mcpStore.toggleServer("ragflowKnowledge");
  };

  useEffect(() => {
    if (!configReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const serverConfig = mcpStoreInstance.state.config.mcpServers["ragflowKnowledge"];
        if (serverConfig?.env) {
          const envObj = typeof serverConfig.env === "string" ? JSON.parse(serverConfig.env) : serverConfig.env;
          if (envObj.configs && !cancelled) {
            setConfigs(envObj.configs);
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [configReady]);

  useEffect(() => {
    if (!mcpEnabled && isMcpEnabled) void toggleServer("ragflowKnowledge");
  }, [mcpEnabled, isMcpEnabled, toggleServer]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center p-4 hover:bg-accent cursor-default"
        onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <img src={ragflowPng} className="h-5 mr-2" alt="RAGFlow" />
            <span className="text-base font-medium">RAGFlow</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Connect to RAGFlow knowledge bases</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Switch checked={isMcpEnabled} disabled={!mcpStore.mcpEnabled} onCheckedChange={toggleMcpServer} />
              }
            />
            {!mcpStore.mcpEnabled && (
              <TooltipContent>
                <p>Enable MCP to access</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Icon icon={isConfigPanelOpen ? "lucide:chevron-up" : "lucide:chevron-down"} className="w-4 h-4" />
        </div>
      </div>
      <Collapsible open={isConfigPanelOpen} onOpenChange={setIsConfigPanelOpen}>
        <CollapsibleContent>
          <div className="p-4 border-t space-y-4">
            {configs.map((config, index) => (
              <div
                key={`${config.endpoint}:${config.datasetIds.join(",")}:${config.description}`}
                className="p-3 border rounded-md relative"
              >
                <div className="absolute top-2 right-2 flex gap-2">
                  <Switch checked={config.enabled === true} onCheckedChange={(v) => toggleConfigEnabled(index, v)} />
                  <button
                    className="text-muted-foreground hover:text-primary"
                    aria-label="Edit RAGFlow config"
                    onClick={() => editConfig(index)}
                  >
                    <Icon icon="lucide:edit" className="h-4 w-4" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove RAGFlow config"
                    onClick={() => removeConfig(index)}
                  >
                    <Icon icon="lucide:trash-2" className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2">
                  <span className="font-medium text-sm">{config.description}</span>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">API Key:</span> {config.apiKey.substring(0, 8) + "****"}
                    </div>
                    <div>
                      <span className="font-medium">Dataset IDs:</span> {config.datasetIds.join(", ")}
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Endpoint:</span> {config.endpoint}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button size="sm" className="w-full" variant="outline" onClick={openAddConfig}>
              <Icon icon="lucide:plus" className="w-8 h-4" />
              Add RAGFlow Config
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit" : "Add"} RAGFlow Config</DialogTitle>
            <DialogDescription>Connect to RAGFlow knowledge bases</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={editingConfig.description}
                onChange={(e) => setEditingConfig((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input
                value={editingConfig.apiKey}
                onChange={(e) => setEditingConfig((p) => ({ ...p, apiKey: e.target.value }))}
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Dataset IDs</Label>
              <Input
                value={editingConfig.datasetIdsStr}
                onChange={(e) => setEditingConfig((p) => ({ ...p, datasetIdsStr: e.target.value }))}
                placeholder="Comma-separated"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Endpoint</Label>
              <Input
                value={editingConfig.endpoint}
                onChange={(e) => setEditingConfig((p) => ({ ...p, endpoint: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button disabled={!isValid} onClick={saveConfig}>
              {isEditing ? "Confirm" : "Add Config"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RagflowKnowledgeSettings;
