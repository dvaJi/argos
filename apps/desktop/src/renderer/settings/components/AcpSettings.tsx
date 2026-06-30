import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import { Input } from "@shadcn/components/ui/input";
import { Textarea } from "@shadcn/components/ui/textarea";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { Separator } from "@shadcn/components/ui/separator";
import { Collapsible, CollapsibleContent } from "@shadcn/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shadcn/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shadcn/components/ui/card";
import type { AcpManualAgent, AcpRegistryAgent } from "@shared/presenter";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { CONFIG_EVENTS } from "@/events";
import { toast } from "@/components/use-toast";
import AcpDebugDialog from "./AcpDebugDialog";
import AcpAgentIcon from "@/components/icons/AcpAgentIcon";
import AgentMcpSelector from "@/components/mcp-config/AgentMcpSelector";

type RegistryDialogFilter = "all" | "installed" | "not_installed";

const parseEnvBlock = (value: string): Record<string, string> => {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const sep = line.indexOf("=");
        if (sep === -1) return [line, ""];
        return [line.slice(0, sep).trim(), line.slice(sep + 1)];
      })
      .filter(([key]) => key.length > 0),
  );
};

const stringifyEnvBlock = (env?: Record<string, string>) =>
  Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

export default function AcpSettings() {
  const configPresenter = useLegacyPresenter("configPresenter");
  const [acpEnabled, setAcpEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSectionOpen, setManualSectionOpen] = useState(false);
  const [sharedMcpOpen, setSharedMcpOpen] = useState(false);
  const [sharedMcpCount, setSharedMcpCount] = useState(0);
  const [registryAgents, setRegistryAgents] = useState<AcpRegistryAgent[]>([]);
  const [manualAgents, setManualAgents] = useState<AcpManualAgent[]>([]);
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [agentPending, setAgentPending] = useState<Record<string, boolean>>({});

  const [registryDialogOpen, setRegistryDialogOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");
  const [registryFilter, setRegistryFilter] = useState<RegistryDialogFilter>("all");

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualEditId, setManualEditId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualCommand, setManualCommand] = useState("");
  const [manualArgsText, setManualArgsText] = useState("");
  const [manualEnv, setManualEnv] = useState("");
  const [manualEnabled, setManualEnabled] = useState(true);

  const [debugOpen, setDebugOpen] = useState(false);
  const [debugAgentId, setDebugAgentId] = useState("");
  const [debugAgentName, setDebugAgentName] = useState("");

  const [uninstallOpen, setUninstallOpen] = useState(false);
  const uninstallAgentRef = useRef<AcpRegistryAgent | null>(null);

  const setPending = (id: string, pending: boolean) =>
    setAgentPending((p) => {
      const next = { ...p };
      if (pending) next[id] = true;
      else delete next[id];
      return next;
    });

  const formatArgs = (args?: string[]) => (args?.length ? args.join(" ") : "None");

  const installedRegistryAgents = useMemo(
    () => registryAgents.filter((a) => a.installState?.status === "installed"),
    [registryAgents],
  );

  const showSharedMcpSection = useMemo(
    () => installedRegistryAgents.length > 0 || manualAgents.length > 0,
    [installedRegistryAgents, manualAgents],
  );

  const filteredRegistryCatalogAgents = useMemo(() => {
    const keyword = registrySearch.trim().toLowerCase();
    return registryAgents.filter((agent) => {
      const matchKeyword =
        !keyword ||
        agent.name.toLowerCase().includes(keyword) ||
        agent.id.toLowerCase().includes(keyword) ||
        (agent.description ?? "").toLowerCase().includes(keyword);
      if (!matchKeyword) return false;
      if (registryFilter === "installed") return agent.installState?.status === "installed";
      if (registryFilter === "not_installed") return agent.installState?.status !== "installed";
      return true;
    });
  }, [registryAgents, registrySearch, registryFilter]);

  const buildPreviewCommand = useCallback((agent: AcpRegistryAgent) => {
    if (agent.distribution.binary) {
      const firstBinary = Object.values(agent.distribution.binary)[0];
      if (firstBinary)
        return firstBinary.args?.length ? `${firstBinary.cmd} ${formatArgs(firstBinary.args)}` : firstBinary.cmd;
    }
    if (agent.distribution.npx) {
      return agent.distribution.npx.args?.length
        ? `npx -y ${agent.distribution.npx.package} ${formatArgs(agent.distribution.npx.args)}`
        : `npx -y ${agent.distribution.npx.package}`;
    }
    if (agent.distribution.uvx) {
      return agent.distribution.uvx.args?.length
        ? `uvx ${agent.distribution.uvx.package} ${formatArgs(agent.distribution.uvx.args)}`
        : `uvx ${agent.distribution.uvx.package}`;
    }
    return "None";
  }, []);

  const installBadgeLabel = (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (status === "installed") return "Installed";
    if (status === "installing") return "Installing";
    if (status === "error") return "Error";
    return "Not Installed";
  };

  const installBadgeClass = (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (status === "installed") return "border-emerald-500/40 text-emerald-600";
    if (status === "installing") return "border-amber-500/40 text-amber-600";
    if (status === "error") return "border-destructive/40 text-destructive";
    return "";
  };

  const registryActionLabel = (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (status === "installed") return "Uninstall";
    if (status === "installing") return "Installing";
    if (status === "error") return "Repair";
    return "Install";
  };

  const registryActionVariant = (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    return status === "installed" ? "destructive" : "default";
  };

  const registryActionIcon = (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (status === "installed") return "lucide:trash-2";
    if (status === "installing") return "lucide:loader";
    if (status === "error") return "lucide:wrench";
    return "lucide:download";
  };

  const isUpdateAvailable = (agent: AcpRegistryAgent): boolean => {
    if (agent.installState?.status !== "installed") return false;
    const installedVersion = agent.installState?.version;
    return Boolean(installedVersion) && installedVersion !== agent.version;
  };

  const syncEnvDrafts = (agents: AcpRegistryAgent[]) => {
    const drafts: Record<string, string> = {};
    agents.forEach((agent) => {
      drafts[agent.id] = stringifyEnvBlock(agent.envOverride);
    });
    setEnvDrafts(drafts);
  };

  const loadAcpData = useCallback(async () => {
    setLoading(true);
    try {
      const enabled = await configPresenter.getAcpEnabled();
      setAcpEnabled(enabled);
      if (!enabled) {
        setRegistryAgents([]);
        setManualAgents([]);
        setSharedMcpCount(0);
        return;
      }
      const [registryList, manualList] = await Promise.all([
        configPresenter.listAcpRegistryAgents(),
        configPresenter.listManualAcpAgents(),
      ]);
      setRegistryAgents(registryList);
      setManualAgents(manualList);
      syncEnvDrafts(registryList);
      const sharedMcp = await configPresenter.getAcpSharedMcpSelections();
      setSharedMcpCount(sharedMcp.length);
    } catch (error) {
      console.error("[ACP] settings error:", error);
    } finally {
      setLoading(false);
    }
  }, [configPresenter]);

  useEffect(() => {
    void loadAcpData();
    const handler = () => {
      const timer = setTimeout(() => void loadAcpData(), 80);
      return () => clearTimeout(timer);
    };
    const off = window.electron?.ipcRenderer?.on(CONFIG_EVENTS.AGENTS_CHANGED, handler);
    return () => {
      off?.();
    };
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await configPresenter.setAcpEnabled(enabled);
      setAcpEnabled(enabled);
      if (enabled) await loadAcpData();
    } catch (error) {
      console.error("[ACP] toggle error:", error);
    } finally {
      setToggling(false);
    }
  };

  const refreshRegistry = async () => {
    setRefreshing(true);
    try {
      const list = await configPresenter.refreshAcpRegistry(true);
      setRegistryAgents(list);
      syncEnvDrafts(list);
    } catch (error) {
      console.error("[ACP] refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleRegistryAgent = async (agent: AcpRegistryAgent, enabled: boolean) => {
    setPending(agent.id, true);
    try {
      await configPresenter.setAcpAgentEnabled(agent.id, enabled);
      await loadAcpData();
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const saveEnvOverride = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      await configPresenter.setAcpAgentEnvOverride(agent.id, parseEnvBlock(envDrafts[agent.id] ?? ""));
      await loadAcpData();
      toast({ title: "Saved" });
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const clearEnvOverride = async (agent: AcpRegistryAgent) => {
    setEnvDrafts((d) => ({ ...d, [agent.id]: "" }));
    await saveEnvOverride(agent);
  };

  const installRegistryAgent = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      if (agent.installState?.status === "error") {
        await configPresenter.repairAcpAgent(agent.id);
      } else {
        await configPresenter.ensureAcpAgentInstalled(agent.id);
      }
      await loadAcpData();
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const repairRegistryAgent = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      await configPresenter.repairAcpAgent(agent.id);
      await loadAcpData();
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const uninstallRegistryAgent = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      await configPresenter.uninstallAcpRegistryAgent(agent.id);
      await loadAcpData();
      toast({ title: "Agent removed" });
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const confirmRegistryAgentUninstall = (agent: AcpRegistryAgent) => {
    uninstallAgentRef.current = agent;
    setUninstallOpen(true);
  };

  const confirmRegistryAgentUninstallAction = async () => {
    const agent = uninstallAgentRef.current;
    if (!agent) return;
    setUninstallOpen(false);
    await uninstallRegistryAgent(agent);
    uninstallAgentRef.current = null;
  };

  const handleRegistryCatalogAction = async (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (agentPending[agent.id] || status === "installing") return;
    if (status === "installed") {
      confirmRegistryAgentUninstall(agent);
      return;
    }
    await installRegistryAgent(agent);
  };

  const openManualDialog = (agent?: AcpManualAgent) => {
    setManualEditId(agent?.id ?? "");
    setManualName(agent?.name ?? "");
    setManualCommand(agent?.command ?? "");
    setManualArgsText((agent?.args ?? []).join("\n"));
    setManualEnv(stringifyEnvBlock(agent?.env));
    setManualEnabled(agent?.enabled ?? true);
    setManualDialogOpen(true);
  };

  const saveManualAgent = async () => {
    if (!manualName.trim() || !manualCommand.trim()) {
      toast({ title: "Missing fields", description: "Name and command are required", variant: "destructive" });
      return;
    }
    setManualSaving(true);
    try {
      const args = manualArgsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        name: manualName.trim(),
        command: manualCommand.trim(),
        args: args.length ? args : undefined,
        env: parseEnvBlock(manualEnv),
        enabled: manualEnabled,
      };
      if (manualEditId) {
        await configPresenter.updateManualAcpAgent(manualEditId, payload);
      } else {
        await configPresenter.addManualAcpAgent(payload);
      }
      setManualDialogOpen(false);
      await loadAcpData();
      toast({ title: "Saved" });
    } catch (error) {
      console.error(error);
    } finally {
      setManualSaving(false);
    }
  };

  const deleteManualAgent = async (agent: AcpManualAgent) => {
    try {
      await configPresenter.removeManualAcpAgent(agent.id);
      await loadAcpData();
    } catch (error) {
      console.error(error);
    }
  };

  const openInspector = (agentId: string, agentName: string) => {
    setDebugAgentId(agentId);
    setDebugAgentName(agentName);
    setDebugOpen(true);
  };

  return (
    <div data-testid="settings-acp-page" className="w-full h-full flex flex-col">
      <div className="shrink-0 px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Agent Client Protocol</div>
            <p className="text-xs text-muted-foreground">Enable and manage ACP-compatible agents</p>
          </div>
          <Switch
            dir="ltr"
            checked={acpEnabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
            className="scale-125"
          />
        </div>

        {acpEnabled && (
          <div className="rounded-xl border bg-muted/20 px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold">Registry Install</div>
              <p className="text-xs text-muted-foreground">Install agents from the ACP registry</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setRegistryDialogOpen(true)}>
                <Icon icon="lucide:download" className="h-4 w-4 mr-2" />
                Registry Install
              </Button>
            </div>
          </div>
        )}

        <Separator />
      </div>

      <div className="flex-1 overflow-y-auto">
        {acpEnabled ? (
          <div className="p-4 space-y-6">
            {showSharedMcpSection && (
              <Collapsible open={sharedMcpOpen} onOpenChange={setSharedMcpOpen} className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-semibold">Shared MCP</div>
                    <p className="text-sm text-muted-foreground">Manage which MCP tools are shared with ACP agents</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">MCP Access: {sharedMcpCount}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setSharedMcpOpen(!sharedMcpOpen)}>
                      {sharedMcpOpen ? "Collapse" : "Expand"}
                    </Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <Card>
                    <CardContent className="pt-6">
                      <AgentMcpSelector
                        onUpdateSelections={(selections: string[]) => setSharedMcpCount(selections.length)}
                      />
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            <section className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">Installed Agents</div>
                  <p className="text-sm text-muted-foreground">Manage your installed ACP agents</p>
                </div>
                <Badge variant="outline">Count: {installedRegistryAgents.length}</Badge>
              </div>

              {loading && !installedRegistryAgents.length ? (
                <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
              ) : !installedRegistryAgents.length ? (
                <Card className="border-dashed">
                  <CardContent className="py-10">
                    <div className="max-w-md mx-auto text-center space-y-3">
                      <div className="text-base font-semibold">No agents installed</div>
                      <p className="text-sm text-muted-foreground">Install agents from the registry to get started</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {installedRegistryAgents.map((agent) => (
                    <Card key={agent.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base flex items-center gap-2 min-w-0">
                              <AcpAgentIcon
                                agentId={agent.id}
                                icon={agent.icon}
                                alt={agent.name}
                                fallbackText={agent.name}
                                customClass="h-8 w-8"
                              />
                              <span className="truncate">{agent.name}</span>
                              <Badge className={installBadgeClass(agent)} variant="outline">
                                {installBadgeLabel(agent)}
                              </Badge>
                              {agent.enabled && <Badge variant="secondary">Enabled</Badge>}
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {agent.description || `Built-in ${agent.name} agent`}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={Boolean(agentPending[agent.id])}
                              onClick={() => confirmRegistryAgentUninstall(agent)}
                            >
                              Uninstall
                            </Button>
                            <Switch
                              checked={agent.enabled}
                              disabled={Boolean(agentPending[agent.id])}
                              onCheckedChange={(value) => void toggleRegistryAgent(agent, value)}
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-start gap-1">
                            <span className="font-semibold">ID:</span>
                            <span className="truncate">{agent.id}</span>
                          </div>
                          <div className="flex items-start gap-1">
                            <span className="font-semibold">Version:</span>
                            <span className="truncate">{agent.version}</span>
                          </div>
                          <div className="flex items-start gap-1">
                            <span className="font-semibold">Command:</span>
                            <span className="truncate">{buildPreviewCommand(agent)}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-muted-foreground">Environment Override</div>
                          <Textarea
                            value={envDrafts[agent.id] ?? ""}
                            onChange={(e) => setEnvDrafts((d) => ({ ...d, [agent.id]: e.target.value }))}
                            className="min-h-[92px] font-mono text-xs"
                            placeholder="KEY=value"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(agentPending[agent.id])}
                              onClick={() => void saveEnvOverride(agent)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={Boolean(agentPending[agent.id])}
                              onClick={() => void clearEnvOverride(agent)}
                            >
                              Clear
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(agentPending[agent.id])}
                              onClick={() => void repairRegistryAgent(agent)}
                            >
                              Repair
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openInspector(agent.id, agent.name)}>
                              Debug
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            <Collapsible open={manualSectionOpen} onOpenChange={setManualSectionOpen} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">Custom Agents</div>
                  <p className="text-sm text-muted-foreground">Add and manage custom ACP agents</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setManualSectionOpen(!manualSectionOpen)}>
                    {manualSectionOpen ? "Collapse" : "Expand"}
                  </Button>
                  <Button size="sm" onClick={() => openManualDialog()}>
                    Add Custom Agent
                  </Button>
                </div>
              </div>

              <CollapsibleContent className="space-y-3">
                {loading && !manualAgents.length ? (
                  <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
                ) : !manualAgents.length ? (
                  <div className="text-sm text-muted-foreground text-center py-8">No custom agents configured</div>
                ) : (
                  <div className="space-y-3">
                    {manualAgents.map((agent) => (
                      <Card key={agent.id}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                              <CardDescription className="text-xs truncate">{agent.command}</CardDescription>
                            </div>
                            <Switch
                              checked={agent.enabled}
                              disabled={Boolean(agentPending[agent.id])}
                              onCheckedChange={async (value) => {
                                setPending(agent.id, true);
                                try {
                                  await configPresenter.updateManualAcpAgent(agent.id, { enabled: value });
                                  await loadAcpData();
                                } finally {
                                  setPending(agent.id, false);
                                }
                              }}
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-start gap-1">
                              <span className="font-semibold">Args:</span>
                              <span className="truncate">{formatArgs(agent.args)}</span>
                            </div>
                            {showSharedMcpSection && (
                              <div className="flex items-start gap-1">
                                <span className="font-semibold">MCP Access:</span>
                                <span className="truncate">
                                  {sharedMcpCount ? `MCP Access: ${sharedMcpCount}` : "None"}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openManualDialog(agent)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm(`Delete agent "${agent.name}"?`)) {
                                  void deleteManualAgent(agent);
                                }
                              }}
                            >
                              Delete
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openInspector(agent.id, agent.name)}>
                              Debug
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">Enable ACP to manage agents</div>
        )}
      </div>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{manualEditId ? "Edit Custom Agent" : "Add Custom Agent"}</DialogTitle>
            <DialogDescription>Configure a custom ACP agent with command and arguments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="My Agent" />
            </div>
            <div className="space-y-2">
              <Label>Command</Label>
              <Input
                value={manualCommand}
                onChange={(e) => setManualCommand(e.target.value)}
                placeholder="npx -y my-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Arguments (one per line)</Label>
              <Textarea
                value={manualArgsText}
                onChange={(e) => setManualArgsText(e.target.value)}
                className="min-h-[96px] font-mono text-xs"
                placeholder="--arg1&#10;--arg2"
              />
            </div>
            <div className="space-y-2">
              <Label>Environment (KEY=value per line)</Label>
              <Textarea
                value={manualEnv}
                onChange={(e) => setManualEnv(e.target.value)}
                className="min-h-[120px] font-mono text-xs"
                placeholder="API_KEY=xxx"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="text-sm text-muted-foreground">Enabled</div>
              <Switch checked={manualEnabled} onCheckedChange={setManualEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={manualSaving} onClick={() => void saveManualAgent()}>
              {manualSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={registryDialogOpen} onOpenChange={setRegistryDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-[760px] p-0 overflow-hidden">
          <div className="flex flex-col max-h-[80vh]">
            <DialogHeader className="px-5 pt-5 pb-4 border-b space-y-4 text-left">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <DialogTitle>Registry Install</DialogTitle>
                  <DialogDescription>Browse and install agents from the ACP registry</DialogDescription>
                </div>
                <div className="flex items-center gap-2 self-end lg:self-start">
                  <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void refreshRegistry()}>
                    <Icon
                      icon={refreshing ? "lucide:loader" : "lucide:refresh-cw"}
                      className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label="Close"
                    onClick={() => setRegistryDialogOpen(false)}
                  >
                    <Icon icon="lucide:x" className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Icon
                    icon="lucide:search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  />
                  <Input
                    value={registrySearch}
                    onChange={(e) => setRegistrySearch(e.target.value)}
                    className="pl-10"
                    placeholder="Search agents..."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={registryFilter === "all" ? "default" : "outline"}
                    onClick={() => setRegistryFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={registryFilter === "installed" ? "default" : "outline"}
                    onClick={() => setRegistryFilter("installed")}
                  >
                    Installed
                  </Button>
                  <Button
                    size="sm"
                    variant={registryFilter === "not_installed" ? "default" : "outline"}
                    onClick={() => setRegistryFilter("not_installed")}
                  >
                    Not Installed
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && !registryAgents.length ? (
                <div className="text-sm text-muted-foreground text-center py-12">Loading...</div>
              ) : !filteredRegistryCatalogAgents.length ? (
                <div className="text-sm text-muted-foreground text-center py-12">No agents found</div>
              ) : (
                <div className="space-y-2">
                  {filteredRegistryCatalogAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-start gap-3 rounded-xl border bg-card px-3 py-3 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                        <AcpAgentIcon
                          agentId={agent.id}
                          icon={agent.icon}
                          alt={agent.name}
                          fallbackText={agent.name}
                          customClass="h-6 w-6"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{agent.name}</span>
                              <Badge className={installBadgeClass(agent)} variant="outline">
                                {installBadgeLabel(agent)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {agent.description || `Built-in ${agent.name} agent`}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isUpdateAvailable(agent) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-accent-400 text-accent-500 hover:bg-accent-400/10"
                                disabled={
                                  Boolean(agentPending[agent.id]) ||
                                  (agent.installState?.status ?? "not_installed") === "installing"
                                }
                                onClick={() => void installRegistryAgent(agent)}
                              >
                                <Icon icon="lucide:arrow-up-circle" className="h-4 w-4" />
                                Update
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={registryActionVariant(agent)}
                              disabled={
                                Boolean(agentPending[agent.id]) ||
                                (agent.installState?.status ?? "not_installed") === "installing"
                              }
                              onClick={() => void handleRegistryCatalogAction(agent)}
                            >
                              <Icon
                                icon={registryActionIcon(agent)}
                                className={`h-4 w-4 ${agent.installState?.status === "installing" ? "animate-spin" : ""}`}
                              />
                              {registryActionLabel(agent)}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{agent.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>v{agent.version}</span>
                          {isUpdateAvailable(agent) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <Badge
                                className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                                variant="outline"
                              >
                                Update available
                              </Badge>
                            </>
                          )}
                          {agent.repository && (
                            <>
                              <span aria-hidden="true">·</span>
                              <a
                                href={agent.repository}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={agent.repository}
                                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                              >
                                Repository
                                <Icon icon="lucide:external-link" className="h-3 w-3" />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={uninstallOpen} onOpenChange={setUninstallOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uninstallAgentRef.current ? `Uninstall ${uninstallAgentRef.current.name}?` : "Uninstall Agent?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the agent and its configuration. You can reinstall it from the registry later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUninstallOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!uninstallAgentRef.current}
              onClick={() => void confirmRegistryAgentUninstallAction()}
            >
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AcpDebugDialog open={debugOpen} agentId={debugAgentId} agentName={debugAgentName} onOpenChange={setDebugOpen} />
    </div>
  );
}
