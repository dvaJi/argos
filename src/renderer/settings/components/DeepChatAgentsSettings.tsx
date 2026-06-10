import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { Badge } from "@shadcn/components/ui/badge";
import { Separator } from "@shadcn/components/ui/separator";
import { Textarea } from "@shadcn/components/ui/textarea";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { useToast } from "@/components/use-toast";
import type { Agent } from "@shared/types/agent-interface";

export default function DeepChatAgentsSettings() {
  const { toast } = useToast();
  const configPresenter = useLegacyPresenter("configPresenter");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId) || null, [agents, selectedAgentId]);

  const loadAgents = useCallback(async () => {
    try {
      const list = await configPresenter.listAgents();
      setAgents(list || []);
      if (list?.length && !selectedAgentId) {
        setSelectedAgentId(list[0].id);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [configPresenter, selectedAgentId]);

  useEffect(() => {
    loadAgents();
  }, []);

  const startCreate = () => {
    setIsCreating(true);
    setNewAgentName("");
  };

  const handleCreate = async () => {
    if (!newAgentName.trim()) return;
    setSaving(true);
    try {
      await configPresenter.createDeepChatAgent({ name: newAgentName.trim() });
      toast({ title: "Agent created" });
      setIsCreating(false);
      setNewAgentName("");
      loadAgents();
    } catch (error) {
      toast({ title: "Failed to create agent", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await configPresenter.deleteDeepChatAgent(agentId);
      toast({ title: "Agent deleted" });
      if (selectedAgentId === agentId) setSelectedAgentId(null);
      loadAgents();
    } catch (error) {
      toast({ title: "Failed to delete agent", description: String(error), variant: "destructive" });
    }
  };

  const handleToggleEnabled = async (agentId: string, enabled: boolean) => {
    try {
      await configPresenter.updateDeepChatAgent(agentId, { enabled });
      loadAgents();
    } catch {}
  };

  return (
    <div data-testid="settings-deepchat-agents-page" className="flex h-full w-full">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-lg font-semibold">Agents</div>
            <div className="text-xs text-muted-foreground">Manage custom agents</div>
          </div>
          <Button size="sm" onClick={startCreate}>
            Add
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedAgentId === agent.id ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                  <Icon icon={agent.icon || "lucide:bot"} className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{agent.name}</div>
                    {agent.protected && <Badge variant="secondary">Built-in</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{agent.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
            </button>
          ))}

          {agents.length === 0 && !loading && (
            <div className="text-center py-8 text-sm text-muted-foreground">No agents yet</div>
          )}

          {isCreating && (
            <div className="rounded-2xl border border-primary p-4 space-y-3">
              <Input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving || !newAgentName.trim()} onClick={handleCreate}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {selectedAgent ? (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{selectedAgent.name}</div>
                <div className="text-xs text-muted-foreground">ID: {selectedAgent.id}</div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={selectedAgent.enabled}
                  onCheckedChange={(v) => handleToggleEnabled(selectedAgent.id, v)}
                />
                {!selectedAgent.protected && (
                  <Button variant="outline" size="sm" onClick={() => handleDelete(selectedAgent.id)}>
                    <Icon icon="lucide:trash-2" className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={selectedAgent.name} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea
                  value={selectedAgent.config?.systemPrompt ?? ""}
                  onChange={(e) => {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.id === selectedAgent.id ? { ...a, config: { ...a.config, systemPrompt: e.target.value } } : a,
                      ),
                    );
                  }}
                  className="min-h-48 resize-y font-mono text-xs"
                  placeholder="System prompt for this agent"
                />
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await configPresenter.updateDeepChatAgent(selectedAgent.id, {
                      config: { systemPrompt: selectedAgent.config?.systemPrompt },
                    });
                    toast({ title: "Saved" });
                  } catch (error) {
                    toast({
                      title: "Save failed",
                      description: String(error),
                      variant: "destructive",
                    });
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an agent to configure
          </div>
        )}
      </main>
    </div>
  );
}
