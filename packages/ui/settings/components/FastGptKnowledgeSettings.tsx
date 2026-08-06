import { useState, useEffect, useMemo } from "react";
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
import { useMcpStore } from "#/stores/mcp";
import { useToast } from "#/components/use-toast";
import fastgptPng from "#/assets/images/fastgpt.png";

interface FastGptConfig {
  description: string;
  apiKey: string;
  datasetId: string;
  endpoint: string;
  enabled?: boolean;
}

const FastGptKnowledgeSettings = () => {
  const mcpStore = useMcpStore();
  const { toast } = useToast();

  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configs, setConfigs] = useState<FastGptConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<FastGptConfig>({
    description: "",
    apiKey: "",
    datasetId: "",
    endpoint: "http://localhost:3000/api",
    enabled: true,
  });
  const [editingIndex, setEditingIndex] = useState(-1);

  const isValid = useMemo(
    () =>
      editingConfig.apiKey.trim() !== "" &&
      editingConfig.datasetId.trim() !== "" &&
      editingConfig.description.trim() !== "",
    [editingConfig],
  );

  const isMcpEnabled = useMemo(() => mcpStore.serverStatuses["fastGptKnowledge"] || false, [mcpStore.serverStatuses]);

  const openAddConfig = () => {
    setIsEditing(false);
    setEditingIndex(-1);
    setEditingConfig({
      description: "",
      apiKey: "",
      datasetId: "",
      endpoint: "http://localhost:3000/api",
      enabled: true,
    });
    setIsConfigDialogOpen(true);
  };

  const editConfig = (index: number) => {
    setIsEditing(true);
    setEditingIndex(index);
    setEditingConfig({ ...configs[index] });
    setIsConfigDialogOpen(true);
  };

  const closeDialog = () => {
    setIsConfigDialogOpen(false);
    setEditingIndex(-1);
  };

  const saveConfig = async () => {
    if (!isValid) return;
    if (isEditing && editingIndex !== -1) {
      setConfigs((prev) => {
        prev[editingIndex] = { ...editingConfig };
        return [...prev];
      });
    } else {
      setConfigs((prev) => [...prev, { ...editingConfig }]);
    }
    await updateToMcp();
    closeDialog();
  };

  const removeConfig = async (index: number) => {
    setConfigs((prev) => {
      prev.splice(index, 1);
      return [...prev];
    });
    await updateToMcp();
  };

  const toggleConfigEnabled = async (index: number, enabled: boolean) => {
    setConfigs((prev) => {
      prev[index].enabled = enabled;
      return [...prev];
    });
    await updateToMcp();
  };

  const updateToMcp = async () => {
    try {
      await mcpStore.updateServer("fastGptKnowledge", { env: { configs } });
    } catch {}
  };

  const loadFromMcp = async () => {
    try {
      const serverConfig = mcpStore.config.mcpServers["fastGptKnowledge"];
      if (serverConfig?.env) {
        const envObj = typeof serverConfig.env === "string" ? JSON.parse(serverConfig.env) : serverConfig.env;
        if (envObj.configs) setConfigs(envObj.configs);
      }
    } catch {}
  };

  const toggleMcpServer = async () => {
    if (!mcpStore.mcpEnabled) return;
    await mcpStore.toggleServer("fastGptKnowledge");
  };

  useEffect(() => {
    if (mcpStore.config.ready) loadFromMcp();
  }, [mcpStore.config.ready]);
  useEffect(() => {
    if (!mcpStore.mcpEnabled && isMcpEnabled) mcpStore.toggleServer("fastGptKnowledge");
  }, [mcpStore.mcpEnabled]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center p-4 hover:bg-accent cursor-default"
        onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <img src={fastgptPng} className="h-5 mr-2" alt="FastGPT" />
            <span className="text-base font-medium">FastGPT</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Connect to FastGPT knowledge bases</p>
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
              <div key={index} className="p-3 border rounded-md relative">
                <div className="absolute top-2 right-2 flex gap-2">
                  <Switch checked={config.enabled === true} onCheckedChange={(v) => toggleConfigEnabled(index, v)} />
                  <button className="text-muted-foreground hover:text-primary" onClick={() => editConfig(index)}>
                    <Icon icon="lucide:edit" className="h-4 w-4" />
                  </button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => removeConfig(index)}>
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
                      <span className="font-medium">Dataset ID:</span> {config.datasetId}
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
              Add FastGPT Config
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit" : "Add"} FastGPT Config</DialogTitle>
            <DialogDescription>Connect to FastGPT knowledge bases</DialogDescription>
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
              <Label className="text-xs text-muted-foreground">Dataset ID</Label>
              <Input
                value={editingConfig.datasetId}
                onChange={(e) => setEditingConfig((p) => ({ ...p, datasetId: e.target.value }))}
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

export default FastGptKnowledgeSettings;
