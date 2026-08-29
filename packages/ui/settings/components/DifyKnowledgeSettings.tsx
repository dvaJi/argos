import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import difyPng from "#/assets/images/dify.png";

interface DifyConfig {
  description: string;
  apiKey: string;
  datasetId: string;
  endpoint: string;
  enabled?: boolean;
}

const DifyKnowledgeSettings = () => {
  const mcpStore = useMcpStore();
  const { toast } = useToast();

  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configs, setConfigs] = useState<DifyConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<DifyConfig>({
    description: "",
    apiKey: "",
    datasetId: "",
    endpoint: "https://api.dify.ai/v1",
    enabled: true,
  });
  const editingIndexRef = useRef(-1);

  const isValid = useMemo(
    () =>
      editingConfig.apiKey.trim() !== "" &&
      editingConfig.datasetId.trim() !== "" &&
      editingConfig.description.trim() !== "",
    [editingConfig],
  );

  const isMcpEnabled = useMemo(() => mcpStore.serverStatuses["difyKnowledge"] || false, [mcpStore.serverStatuses]);

  const openAddConfig = () => {
    setIsEditing(false);
    editingIndexRef.current = -1;
    setEditingConfig({
      description: "",
      apiKey: "",
      datasetId: "",
      endpoint: "https://api.dify.ai/v1",
      enabled: true,
    });
    setIsConfigDialogOpen(true);
  };

  const editConfig = (index: number) => {
    setIsEditing(true);
    editingIndexRef.current = index;
    setEditingConfig({ ...configs[index] });
    setIsConfigDialogOpen(true);
  };

  const closeDialog = () => {
    setIsConfigDialogOpen(false);
    editingIndexRef.current = -1;
    setEditingConfig({
      description: "",
      apiKey: "",
      datasetId: "",
      endpoint: "https://api.dify.ai/v1",
      enabled: true,
    });
  };

  const saveConfig = async () => {
    if (!isValid) return;
    if (isEditing && editingIndexRef.current !== -1) {
      setConfigs((prev) =>
        prev.map((config, index) => (index === editingIndexRef.current ? { ...editingConfig } : config)),
      );
      toast({ title: "Config updated", description: "Dify config updated" });
    } else {
      setConfigs((prev) => [...prev, { ...editingConfig }]);
      toast({ title: "Config added", description: "Dify config added" });
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
      await mcpStore.updateServer("difyKnowledge", { env: { configs } });
    } catch (error) {
      toast({ title: "Operation failed", description: String(error), variant: "destructive" });
    }
  };

  const loadFromMcp = async () => {
    try {
      const serverConfig = mcpStore.config.mcpServers["difyKnowledge"];
      if (serverConfig?.env) {
        const envObj = typeof serverConfig.env === "string" ? JSON.parse(serverConfig.env) : serverConfig.env;
        if (envObj.configs && Array.isArray(envObj.configs)) {
          setConfigs(envObj.configs);
        }
      }
    } catch {}
  };

  const toggleMcpServer = async () => {
    if (!mcpStore.mcpEnabled) return;
    await mcpStore.toggleServer("difyKnowledge");
  };

  const configReady = mcpStore.config.ready;

  useEffect(() => {
    if (!configReady) return;
    void Promise.resolve().then(() => loadFromMcp());
  }, [configReady, loadFromMcp]);

  const difyAutoToggleInFlightRef = useRef(false);
  useEffect(() => {
    if (mcpStore.mcpEnabled || !isMcpEnabled) {
      difyAutoToggleInFlightRef.current = false;
      return;
    }
    if (difyAutoToggleInFlightRef.current) return;
    difyAutoToggleInFlightRef.current = true;
    void Promise.resolve().then(() => mcpStore.toggleServer("difyKnowledge"));
  }, [mcpStore, isMcpEnabled]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center p-4 hover:bg-accent cursor-default"
        onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <img src={difyPng} className="h-5 mr-2" alt="Dify" />
            <span className="text-base font-medium">Dify</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Connect to Dify knowledge bases</p>
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
            {configs.length > 0 && (
              <div className="space-y-3">
                {configs.map((config, index) => (
                  <div
                    key={`${config.endpoint}:${config.datasetId}:${config.description}`}
                    className="p-3 border rounded-md relative"
                  >
                    <div className="absolute top-2 right-2 flex gap-2">
                      <Switch
                        checked={config.enabled === true}
                        onCheckedChange={(v) => toggleConfigEnabled(index, v)}
                      />
                      <button
                        className="text-muted-foreground hover:text-primary"
                        aria-label="Edit Dify config"
                        onClick={() => editConfig(index)}
                      >
                        <Icon icon="lucide:edit" className="h-4 w-4" />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove Dify config"
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
                          <span className="font-medium">Dataset ID:</span> {config.datasetId}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Endpoint:</span> {config.endpoint}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-center">
              <Button size="sm" className="w-full" variant="outline" onClick={openAddConfig}>
                <Icon icon="lucide:plus" className="w-8 h-4" />
                Add Dify Config
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Dify Config" : "Add Dify Config"}</DialogTitle>
            <DialogDescription>Connect to Dify knowledge bases</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={editingConfig.description}
                onChange={(e) => setEditingConfig((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input
                value={editingConfig.apiKey}
                onChange={(e) => setEditingConfig((p) => ({ ...p, apiKey: e.target.value }))}
                type="password"
                placeholder="Dify API Key"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Dataset ID</Label>
              <Input
                value={editingConfig.datasetId}
                onChange={(e) => setEditingConfig((p) => ({ ...p, datasetId: e.target.value }))}
                placeholder="Dify Dataset ID"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Endpoint</Label>
              <Input
                value={editingConfig.endpoint}
                onChange={(e) => setEditingConfig((p) => ({ ...p, endpoint: e.target.value }))}
                placeholder="https://api.dify.ai/v1"
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

export default DifyKnowledgeSettings;
