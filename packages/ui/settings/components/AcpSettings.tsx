import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Input } from "#shadcn/components/ui/input";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Switch } from "#shadcn/components/ui/switch";
import { Separator } from "#shadcn/components/ui/separator";
import { Collapsible, CollapsibleContent } from "#shadcn/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "#shadcn/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#shadcn/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#shadcn/components/ui/field";
import { Skeleton } from "#shadcn/components/ui/skeleton";
import { Spinner } from "#shadcn/components/ui/spinner";
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
} from "#shadcn/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import type { AcpManualAgent, AcpRegistryAgent } from "@argos/shared/presenter";
import { createConfigClient } from "#api/ConfigClient";
import { toast } from "#/components/use-toast";
import AcpDebugDialog from "./AcpDebugDialog";
import AcpDiagnostics from "./AcpDiagnostics";
import AcpAgentIcon from "#/components/icons/AcpAgentIcon";
import AgentMcpSelector from "#/components/mcp-config/AgentMcpSelector";

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

const formatArgs = (args?: string[]) => (args?.length ? args.join(" ") : "None");

const buildPreviewCommand = (agent: AcpRegistryAgent) => {
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
};

const installBadgeLabel = (agent: AcpRegistryAgent) => {
  const status = agent.installState?.status ?? "not_installed";
  if (status === "installed") return agent.enabled ? "Enabled" : "Installed, off";
  if (status === "installing") return "Installing";
  if (status === "error") return "Error";
  return "Not Installed";
};

const installBadgeClass = (agent: AcpRegistryAgent) => {
  const status = agent.installState?.status ?? "not_installed";
  if (status === "installed") return "text-foreground";
  if (status === "installing") return "text-muted-foreground";
  if (status === "error") return "border-destructive/40 text-destructive";
  return "";
};

const registryActionLabel = (agent: AcpRegistryAgent) => {
  const status = agent.installState?.status ?? "not_installed";
  if (status === "installed") return agent.enabled ? "Enabled" : "Enable";
  if (status === "installing") return "Installing";
  if (status === "error") return "Repair";
  return "Install";
};

const registryActionVariant = (agent: AcpRegistryAgent) =>
  agent.installState?.status === "installed" ? "outline" : "default";

const registryActionIcon = (agent: AcpRegistryAgent) => {
  const status = agent.installState?.status ?? "not_installed";
  if (status === "installed") return agent.enabled ? "lucide:check" : "lucide:power";
  if (status === "installing") return "lucide:loader";
  if (status === "error") return "lucide:wrench";
  return "lucide:download";
};

const isUpdateAvailable = (agent: AcpRegistryAgent): boolean => {
  if (agent.installState?.status !== "installed") return false;
  const installedVersion = agent.installState?.version;
  return Boolean(installedVersion) && installedVersion !== agent.version;
};

const updatePendingState = (current: Record<string, boolean>, id: string, pending: boolean) => {
  const next = { ...current };
  if (pending) next[id] = true;
  else delete next[id];
  return next;
};

const incrementAgentRequest = (current: Record<string, number>, id: string) => ({
  ...current,
  [id]: (current[id] ?? 0) + 1,
});

const consumeAgentRequest = (current: Record<string, number>, id: string, request: number) =>
  current[id] === request ? { ...current, [id]: 0 } : current;

const subscribeToAgentChanges = (listener: () => void) =>
  window.argos?.on?.("config.agents.changed" as never, listener) ?? (() => undefined);

export default function AcpSettings() {
  const configClient = useMemo(() => createConfigClient(), []);
  const [acpEnabled, setAcpEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSectionOpen, setManualSectionOpen] = useState(false);
  const [sharedMcpOpen, setSharedMcpOpen] = useState(false);
  const [sharedMcpCount, setSharedMcpCount] = useState(0);
  const [registryAgents, setRegistryAgents] = useState<AcpRegistryAgent[]>([]);
  const [manualAgents, setManualAgents] = useState<AcpManualAgent[]>([]);
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [agentPending, setAgentPending] = useState<Record<string, boolean>>({});
  const [agentConfigurationOpen, setAgentConfigurationOpen] = useState<Record<string, boolean>>({});
  const [connectionCheckRequests, setConnectionCheckRequests] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const [uninstallAgent, setUninstallAgent] = useState<AcpRegistryAgent | null>(null);

  const setPending = (id: string, pending: boolean) =>
    setAgentPending((current) => updatePendingState(current, id, pending));

  const requestConnectionCheck = (id: string) =>
    setConnectionCheckRequests((current) => incrementAgentRequest(current, id));

  const consumeConnectionCheckRequest = useCallback((id: string, request: number) => {
    setConnectionCheckRequests((current) => consumeAgentRequest(current, id, request));
  }, []);

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

  const syncEnvDrafts = useCallback((agents: AcpRegistryAgent[]) => {
    const drafts: Record<string, string> = {};
    agents.forEach((agent) => {
      drafts[agent.id] = stringifyEnvBlock(agent.envOverride);
    });
    setEnvDrafts(drafts);
  }, []);

  const loadAcpData = useCallback(async () => {
    try {
      const enabled = await configClient.getAcpEnabled();
      setLoadError(null);
      setAcpEnabled(enabled);
      if (!enabled) {
        setRegistryAgents([]);
        setManualAgents([]);
        setSharedMcpCount(0);
        return;
      }
      const [registryList, manualList] = await Promise.all([
        configClient.listAcpRegistryAgents(),
        configClient.listManualAcpAgents(),
      ]);
      setRegistryAgents(registryList);
      setManualAgents(manualList);
      syncEnvDrafts(registryList);
      const sharedMcp = await configClient.getAcpSharedMcpSelections();
      setSharedMcpCount(sharedMcp.length);
    } catch (error) {
      console.error("[ACP] settings error:", error);
      setLoadError(error instanceof Error ? error.message : "ACP settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [configClient, syncEnvDrafts]);

  useEffect(() => {
    queueMicrotask(() => void loadAcpData());
    return subscribeToAgentChanges(() => void loadAcpData());
  }, [loadAcpData]);

  const handleToggle = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await configClient.setAcpEnabled(enabled);
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
      const list = await configClient.refreshAcpRegistry(true);
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
      await configClient.setAcpAgentEnabled(agent.id, enabled);
      if (enabled) requestConnectionCheck(agent.id);
      await loadAcpData();
    } catch (error) {
      console.error(error);
      toast({
        title: enabled ? "Agent could not be enabled" : "Agent could not be disabled",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPending(agent.id, false);
    }
  };

  const saveEnvOverride = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      await configClient.setAcpAgentEnvOverride(agent.id, parseEnvBlock(envDrafts[agent.id] ?? ""));
      await loadAcpData();
      toast({ title: "Saved" });
    } catch (error) {
      console.error(error);
      await loadAcpData();
      toast({
        title: "Environment could not be saved",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
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
      const isFreshInstall = agent.installState?.status !== "installed" && agent.installState?.status !== "error";
      if (agent.installState?.status === "error") {
        await configClient.repairAcpAgent(agent.id);
      } else {
        await configClient.ensureAcpAgentInstalled(agent.id);
      }
      if (isFreshInstall) {
        await configClient.setAcpAgentEnabled(agent.id, true);
        requestConnectionCheck(agent.id);
        toast({
          title: `${agent.name} installed and enabled`,
          description: "Checking its connection now.",
        });
      }
      await loadAcpData();
    } catch (error) {
      console.error(error);
      await loadAcpData();
      toast({
        title: "Agent setup did not finish",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPending(agent.id, false);
    }
  };

  const repairRegistryAgent = async (agent: AcpRegistryAgent) => {
    setPending(agent.id, true);
    try {
      await configClient.repairAcpAgent(agent.id);
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
      await configClient.uninstallAcpRegistryAgent(agent.id);
      await loadAcpData();
      toast({ title: "Agent removed" });
    } catch (error) {
      console.error(error);
    } finally {
      setPending(agent.id, false);
    }
  };

  const confirmRegistryAgentUninstall = (agent: AcpRegistryAgent) => {
    setUninstallAgent(agent);
    setUninstallOpen(true);
  };

  const confirmRegistryAgentUninstallAction = async () => {
    const agent = uninstallAgent;
    if (!agent) return;
    setUninstallOpen(false);
    await uninstallRegistryAgent(agent);
    setUninstallAgent(null);
  };

  const handleRegistryCatalogAction = async (agent: AcpRegistryAgent) => {
    const status = agent.installState?.status ?? "not_installed";
    if (agentPending[agent.id] || status === "installing") return;
    if (status === "installed") {
      if (!agent.enabled) await toggleRegistryAgent(agent, true);
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
      const wasEnabled = manualEditId
        ? Boolean(manualAgents.find((agent) => agent.id === manualEditId)?.enabled)
        : false;
      if (manualEditId) {
        await configClient.updateManualAcpAgent(manualEditId, payload);
      } else {
        const addedAgent = await configClient.addManualAcpAgent(payload);
        if (payload.enabled) {
          requestConnectionCheck(addedAgent.id);
          setManualSectionOpen(true);
        }
      }
      if (manualEditId && payload.enabled && !wasEnabled) requestConnectionCheck(manualEditId);
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
      await configClient.removeManualAcpAgent(agent.id);
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
    <TooltipProvider>
      <div data-testid="settings-acp-page" className="flex size-full flex-col">
        <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight">Agent Client Protocol</h1>
              <p className="text-sm text-muted-foreground">Connect external coding agents to Argos.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">ACP {acpEnabled ? "enabled" : "disabled"}</div>
                <p className="text-xs text-muted-foreground">Applies to all agents</p>
              </div>
              <Switch
                aria-label="Enable Agent Client Protocol"
                dir="ltr"
                checked={acpEnabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
              />
            </div>
          </div>

          {acpEnabled && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon icon="lucide:route" className="size-3.5 shrink-0" />
              Install enables an agent and checks its default connection automatically.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {acpEnabled ? (
            <div className="flex flex-col gap-6 p-4">
              {loadError && (
                <Alert variant="destructive">
                  <Icon icon="lucide:triangle-alert" />
                  <AlertTitle>ACP settings could not be loaded</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              )}

              {showSharedMcpSection && (
                <Collapsible open={sharedMcpOpen} onOpenChange={setSharedMcpOpen} className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold">Shared MCP access</h2>
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
                    <div className="rounded-xl border px-4 py-4">
                      <AgentMcpSelector
                        onUpdateSelections={(selections: string[]) => setSharedMcpCount(selections.length)}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <section className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">Agents</h2>
                    <p className="text-xs text-muted-foreground">
                      Manage installed agents and verify their connections.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openManualDialog()}>
                      <Icon icon="lucide:plus" />
                      Add custom
                    </Button>
                    <Button size="sm" onClick={() => setRegistryDialogOpen(true)}>
                      <Icon icon="lucide:download" />
                      Browse registry
                    </Button>
                  </div>
                </div>

                {loading && !installedRegistryAgents.length ? (
                  <div className="flex flex-col overflow-hidden rounded-xl border" aria-label="Loading agents">
                    {[0, 1].map((item) => (
                      <div key={item} className="flex items-center gap-3 border-b px-4 py-5 last:border-b-0">
                        <Skeleton className="size-10 shrink-0 rounded-lg" />
                        <div className="flex flex-1 flex-col gap-2">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-64 max-w-full" />
                        </div>
                        <Skeleton className="h-8 w-20" />
                      </div>
                    ))}
                  </div>
                ) : !installedRegistryAgents.length ? (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Icon icon="lucide:bot" />
                      </EmptyMedia>
                      <EmptyTitle>No agents installed</EmptyTitle>
                      <EmptyDescription>
                        Choose an ACP agent from the registry. Argos will install and enable it.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={() => setRegistryDialogOpen(true)}>
                        <Icon icon="lucide:download" />
                        Browse registry
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    {installedRegistryAgents.map((agent) => (
                      <Collapsible
                        key={agent.id}
                        open={Boolean(agentConfigurationOpen[agent.id])}
                        onOpenChange={(open) =>
                          setAgentConfigurationOpen((current) => ({ ...current, [agent.id]: open }))
                        }
                      >
                        <article>
                          <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <AcpAgentIcon
                                agentId={agent.id}
                                icon={agent.icon}
                                alt={agent.name}
                                fallbackText={agent.name}
                                customClass="size-8"
                              />
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {agent.description || `Built-in ${agent.name} agent`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 lg:justify-end">
                              <div className="flex items-center px-1.5">
                                <Switch
                                  aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                                  checked={agent.enabled}
                                  disabled={Boolean(agentPending[agent.id])}
                                  onCheckedChange={(value) => void toggleRegistryAgent(agent, value)}
                                />
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`${agentConfigurationOpen[agent.id] ? "Hide" : "Show"} ${agent.name} setup`}
                                    aria-expanded={Boolean(agentConfigurationOpen[agent.id])}
                                    onClick={() =>
                                      setAgentConfigurationOpen((current) => ({
                                        ...current,
                                        [agent.id]: !current[agent.id],
                                      }))
                                    }
                                  >
                                    <Icon icon="lucide:settings-2" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {agentConfigurationOpen[agent.id] ? "Hide setup" : "Configure agent"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <AcpDiagnostics
                            agentId={agent.id}
                            agentName={agent.name}
                            launchSource={agent.source}
                            canRun={agent.enabled}
                            autoCheckRequest={connectionCheckRequests[agent.id] ?? 0}
                            onAutoCheckHandled={(request) => consumeConnectionCheckRequest(agent.id, request)}
                          />

                          <CollapsibleContent>
                            <div className="flex flex-col gap-4 border-t px-3 py-3">
                              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                                <div>
                                  <dt className="font-medium text-foreground">Agent ID</dt>
                                  <dd className="truncate font-mono">{agent.id}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-foreground">Version</dt>
                                  <dd className="truncate">{agent.version}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-foreground">Command</dt>
                                  <dd className="truncate font-mono">{buildPreviewCommand(agent)}</dd>
                                </div>
                              </dl>

                              <Field>
                                <FieldLabel htmlFor={`acp-env-${agent.id}`}>Environment overrides</FieldLabel>
                                <Textarea
                                  id={`acp-env-${agent.id}`}
                                  value={envDrafts[agent.id] ?? ""}
                                  onChange={(event) =>
                                    setEnvDrafts((current) => ({ ...current, [agent.id]: event.target.value }))
                                  }
                                  className="min-h-24 font-mono text-xs"
                                  placeholder="KEY=value"
                                />
                                <FieldDescription>
                                  One KEY=value pair per line. Values are stored with this agent.
                                </FieldDescription>
                              </Field>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  disabled={Boolean(agentPending[agent.id])}
                                  onClick={() => void saveEnvOverride(agent)}
                                >
                                  {agentPending[agent.id] && <Spinner />}
                                  Save environment
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
                                  <Icon icon="lucide:wrench" />
                                  Repair installation
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!agent.enabled || Boolean(agentPending[agent.id])}
                                  title={
                                    agent.enabled ? undefined : "Enable this agent before opening the debug console"
                                  }
                                  onClick={() => openInspector(agent.id, agent.name)}
                                >
                                  <Icon icon="lucide:bug" />
                                  Open debug console
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={Boolean(agentPending[agent.id])}
                                  onClick={() => confirmRegistryAgentUninstall(agent)}
                                >
                                  <Icon icon="lucide:trash-2" />
                                  Uninstall
                                </Button>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </article>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              <Collapsible open={manualSectionOpen} onOpenChange={setManualSectionOpen} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">Custom agents</h2>
                    <p className="text-xs text-muted-foreground">
                      Agents configured with your own command and arguments.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setManualSectionOpen(!manualSectionOpen)}>
                      {manualSectionOpen ? "Collapse" : "Expand"}
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  {loading && !manualAgents.length ? (
                    <Skeleton className="h-24 w-full" />
                  ) : !manualAgents.length ? (
                    <Empty className="border py-8">
                      <EmptyHeader>
                        <EmptyTitle>No custom agents</EmptyTitle>
                        <EmptyDescription>Add one when an agent is not available in the registry.</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button size="sm" variant="outline" onClick={() => openManualDialog()}>
                          <Icon icon="lucide:plus" />
                          Add custom agent
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <div className="divide-y overflow-hidden rounded-xl border bg-card">
                      {manualAgents.map((agent) => (
                        <article key={agent.id}>
                          <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Icon icon="lucide:terminal-square" className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                  {agent.command}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex items-center px-1.5">
                                <Switch
                                  aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                                  checked={agent.enabled}
                                  disabled={Boolean(agentPending[agent.id])}
                                  onCheckedChange={async (value) => {
                                    setPending(agent.id, true);
                                    try {
                                      await configClient.updateManualAcpAgent(agent.id, { enabled: value });
                                      if (value) requestConnectionCheck(agent.id);
                                      await loadAcpData();
                                    } finally {
                                      setPending(agent.id, false);
                                    }
                                  }}
                                />
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Edit ${agent.name}`}
                                    onClick={() => openManualDialog(agent)}
                                  >
                                    <Icon icon="lucide:pencil" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit agent</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Open ${agent.name} debug console`}
                                    disabled={!agent.enabled}
                                    onClick={() => openInspector(agent.id, agent.name)}
                                  >
                                    <Icon icon="lucide:bug" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {agent.enabled ? "Open debug console" : "Enable the agent before debugging"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    aria-label={`Delete ${agent.name}`}
                                    onClick={() => {
                                      if (window.confirm(`Delete agent "${agent.name}"?`)) {
                                        void deleteManualAgent(agent);
                                      }
                                    }}
                                  >
                                    <Icon icon="lucide:trash-2" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete agent</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          <AcpDiagnostics
                            agentId={agent.id}
                            agentName={agent.name}
                            launchSource={agent.source}
                            canRun={agent.enabled}
                            autoCheckRequest={connectionCheckRequests[agent.id] ?? 0}
                            onAutoCheckHandled={(request) => consumeConnectionCheckRequest(agent.id, request)}
                          />
                        </article>
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
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="acp-manual-name">Agent name</FieldLabel>
                <Input
                  id="acp-manual-name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="My Agent"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="acp-manual-command">Command</FieldLabel>
                <Input
                  id="acp-manual-command"
                  value={manualCommand}
                  onChange={(e) => setManualCommand(e.target.value)}
                  placeholder="npx -y my-agent"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="acp-manual-args">Arguments</FieldLabel>
                <Textarea
                  id="acp-manual-args"
                  value={manualArgsText}
                  onChange={(e) => setManualArgsText(e.target.value)}
                  className="min-h-[96px] font-mono text-xs"
                  placeholder="--arg1&#10;--arg2"
                />
                <FieldDescription>Enter one argument per line.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="acp-manual-env">Environment</FieldLabel>
                <Textarea
                  id="acp-manual-env"
                  value={manualEnv}
                  onChange={(e) => setManualEnv(e.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                  placeholder="API_KEY=xxx"
                />
                <FieldDescription>Enter one KEY=value pair per line.</FieldDescription>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border px-3 py-3">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor="acp-manual-enabled">Enabled</FieldLabel>
                  <FieldDescription>Make this agent available immediately after saving.</FieldDescription>
                </div>
                <Switch id="acp-manual-enabled" checked={manualEnabled} onCheckedChange={setManualEnabled} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setManualDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={manualSaving} onClick={() => void saveManualAgent()}>
                {manualSaving && <Spinner />}
                {manualSaving ? "Saving" : "Save agent"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={registryDialogOpen} onOpenChange={setRegistryDialogOpen}>
          <DialogContent showCloseButton={false} className="sm:max-w-[760px] p-0 overflow-hidden">
            <div className="flex flex-col max-h-[80vh]">
              <DialogHeader className="flex flex-col gap-4 border-b px-5 pt-5 pb-4 text-left">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-1">
                    <DialogTitle>Browse ACP registry</DialogTitle>
                    <DialogDescription>Install an agent and Argos will enable it automatically.</DialogDescription>
                  </div>
                  <div className="flex items-center gap-2 self-end lg:self-start">
                    <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void refreshRegistry()}>
                      {refreshing ? <Spinner /> : <Icon icon="lucide:refresh-cw" />}
                      Refresh
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setRegistryDialogOpen(false)}>
                      <Icon icon="lucide:x" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Icon
                      icon="lucide:search"
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={registrySearch}
                      onChange={(e) => setRegistrySearch(e.target.value)}
                      className="pl-10"
                      placeholder="Search agents"
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
                  <div className="flex flex-col gap-3 py-4" aria-label="Loading registry">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <Skeleton className="size-10 rounded-lg" />
                        <div className="flex flex-1 flex-col gap-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-full max-w-96" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !filteredRegistryCatalogAgents.length ? (
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Icon icon="lucide:search-x" />
                      </EmptyMedia>
                      <EmptyTitle>No matching agents</EmptyTitle>
                      <EmptyDescription>Try a different search or clear the current filter.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRegistrySearch("");
                          setRegistryFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="divide-y overflow-hidden rounded-xl border">
                    {filteredRegistryCatalogAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-start gap-3 bg-card px-3 py-3 transition-colors hover:bg-accent/30"
                      >
                        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                          <AcpAgentIcon
                            agentId={agent.id}
                            icon={agent.icon}
                            alt={agent.name}
                            fallbackText={agent.name}
                            customClass="size-6"
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
                                  disabled={
                                    Boolean(agentPending[agent.id]) ||
                                    (agent.installState?.status ?? "not_installed") === "installing"
                                  }
                                  onClick={() => void installRegistryAgent(agent)}
                                >
                                  <Icon icon="lucide:arrow-up-circle" />
                                  Update
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant={registryActionVariant(agent)}
                                disabled={
                                  Boolean(agentPending[agent.id]) ||
                                  (agent.installState?.status ?? "not_installed") === "installing" ||
                                  (agent.installState?.status === "installed" && agent.enabled)
                                }
                                onClick={() => void handleRegistryCatalogAction(agent)}
                              >
                                <Icon
                                  icon={registryActionIcon(agent)}
                                  className={agent.installState?.status === "installing" ? "animate-spin" : undefined}
                                />
                                {registryActionLabel(agent)}
                              </Button>
                            </div>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-mono">{agent.id}</span>
                            <span aria-hidden="true">·</span>
                            <span>v{agent.version}</span>
                            {isUpdateAvailable(agent) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <Badge variant="secondary">Update available</Badge>
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
                                  <Icon icon="lucide:external-link" className="size-3" />
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
                {uninstallAgent ? `Uninstall ${uninstallAgent.name}?` : "Uninstall Agent?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the agent and its configuration. You can reinstall it from the registry later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setUninstallOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!uninstallAgent}
                onClick={() => void confirmRegistryAgentUninstallAction()}
              >
                Uninstall
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AcpDebugDialog
          open={debugOpen}
          agentId={debugAgentId}
          agentName={debugAgentName}
          onOpenChange={setDebugOpen}
        />
      </div>
    </TooltipProvider>
  );
}
