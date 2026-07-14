import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#shadcn/components/ui/alert-dialog";
import { useMcpStore } from "#/stores/mcp";
import { useToast } from "#/components/use-toast";
import { usePresenter } from "#api/presenterBridge";
import type { BuiltinKnowledgeConfig } from "@argos/shared/presenter";

interface BuiltinKnowledgeSettingsProps {
  onShowDetail: (detail: BuiltinKnowledgeConfig) => void;
}

export default function BuiltinKnowledgeSettings({ onShowDetail }: BuiltinKnowledgeSettingsProps) {
  const mcpStore = useMcpStore();
  const { toast } = useToast();
  const knowledgePresenter = usePresenter("configPresenter");

  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [configs, setConfigs] = useState<BuiltinKnowledgeConfig[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BuiltinKnowledgeConfig | null>(null);
  const [isMcpEnabled, setIsMcpEnabled] = useState(false);

  const loadConfigs = useCallback(async () => {
    try {
      const list = await knowledgePresenter.getKnowledgeConfigs();
      setConfigs(list || []);
    } catch {}
  }, [knowledgePresenter]);

  const toggleMcpServer = async () => {
    if (!mcpStore.mcpEnabled) return;
    await mcpStore.toggleServer("builtinKnowledge");
  };

  useEffect(() => {
    setIsMcpEnabled(mcpStore.serverStatuses["builtinKnowledge"] || false);
  }, [mcpStore.serverStatuses]);

  useEffect(() => {
    if (mcpStore.config.ready) loadConfigs();
  }, [mcpStore.config.ready, loadConfigs]);

  const handleSetting = (config: BuiltinKnowledgeConfig) => {
    onShowDetail(config);
  };

  const handleCreate = async (_name: string, description: string, embeddingModel: string) => {
    try {
      const currentConfigs = await knowledgePresenter.getKnowledgeConfigs();
      const newConfig: BuiltinKnowledgeConfig = {
        id: `kb_${Date.now()}`,
        description,
        enabled: true,
        embedding: { modelId: embeddingModel, providerId: "" },
        dimensions: 1536,
        normalized: true,
        fragmentsNumber: 1,
      };
      await knowledgePresenter.setKnowledgeConfigs([...currentConfigs, newConfig]);
      toast({ title: "Created successfully" });
      setIsCreateDialogOpen(false);
      loadConfigs();
    } catch (error) {
      toast({ title: "Creation failed", description: String(error), variant: "destructive" });
    }
  };

  const handleDelete = async (index: number) => {
    const config = configs[index];
    try {
      const currentConfigs = await knowledgePresenter.getKnowledgeConfigs();
      await knowledgePresenter.setKnowledgeConfigs(currentConfigs.filter((c) => c.id !== config.id));
      toast({ title: "Deleted successfully" });
      loadConfigs();
    } catch (error) {
      toast({ title: "Deletion failed", description: String(error), variant: "destructive" });
    }
  };

  const toggleConfigEnabled = async (index: number, enabled: boolean) => {
    const config = configs[index];
    try {
      const currentConfigs = await knowledgePresenter.getKnowledgeConfigs();
      await knowledgePresenter.setKnowledgeConfigs(
        currentConfigs.map((c) => (c.id === config.id ? { ...c, enabled } : c)),
      );
      loadConfigs();
    } catch {}
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center p-4 hover:bg-accent cursor-default"
        onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
      >
        <div className="flex-1">
          <div className="flex items-center">
            <Icon icon="lucide:book-open" className="h-5 mr-2 text-primary" />
            <span className="text-base font-medium">Built-in Knowledge</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Local vector knowledge base</p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Switch checked={isMcpEnabled} disabled={!mcpStore.mcpEnabled} onCheckedChange={toggleMcpServer} />
              </TooltipTrigger>
              {!mcpStore.mcpEnabled && (
                <TooltipContent>
                  <p>Enable MCP to access</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
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
                  <button className="text-muted-foreground hover:text-primary" onClick={() => handleSetting(config)}>
                    <Icon icon="lucide:file-diff" className="h-4 w-4" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setEditingConfig(config);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    <Icon icon="lucide:edit" className="h-4 w-4" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-muted-foreground hover:text-destructive">
                        <Icon icon="lucide:trash-2" className="h-4 w-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove "{config.description}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete the knowledge base and all its files.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(index)}>Confirm</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="grid gap-2">
                  <span className="font-medium text-sm w-[calc(100%-120px)]">{config.description}</span>
                  <div className="text-xs text-muted-foreground">
                    Model: {config.embedding.modelId} | Dimension: {config.dimensions}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-center">
              <Button size="sm" className="w-full" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
                <Icon icon="lucide:plus" className="w-4 h-4 mr-1" />
                Add Knowledge Base
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <CreateKnowledgeDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onCreate={handleCreate} />
    </div>
  );
}

function CreateKnowledgeDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, description: string, model: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim(), "default");
    setName("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Knowledge Base</DialogTitle>
          <DialogDescription>Create a new built-in knowledge base</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Knowledge base name" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} onClick={handleSave}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
