import { useState, useEffect, useMemo, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shadcn/components/ui/card";
import type { AcpManualAgent, AcpRegistryAgent } from "@shared/presenter";
import type { AgentTransferImpact } from "@shared/types/agent-interface";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { createSessionClient } from "@api/SessionClient";
import { CONFIG_EVENTS } from "@/events";

type RegistryDialogFilter = "all" | "installed" | "not_installed";
type PendingDeleteAgent = {
  id: string;
  name: string;
  source: "manual" | "registry";
};

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

  const installedRegistryAgents = useMemo(
    () => registryAgents.filter((a) => a.installState?.status === "installed"),
    [registryAgents],
  );

  const showSharedMcpSection = useMemo(
    () => installedRegistryAgents.length > 0 || manualAgents.length > 0,
    [installedRegistryAgents, manualAgents],
  );

  const formatArgs = (args?: string[]) => (args?.length ? args.join(" ") : "None");

  const buildPreviewCommand = useCallback((agent: AcpRegistryAgent) => {
    if (agent.distribution.binary) {
      const firstBinary = Object.values(agent.distribution.binary)[0];
      if (firstBinary) {
        return firstBinary.args?.length ? `${firstBinary.cmd} ${formatArgs(firstBinary.args)}` : firstBinary.cmd;
      }
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
      const newDrafts: Record<string, string> = {};
      registryList.forEach((agent: AcpRegistryAgent) => {
        const env = agent.envOverride ?? {};
        newDrafts[agent.id] = Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
      });
      setEnvDrafts(newDrafts);
      const sharedMcp = await configPresenter.getAcpSharedMcpSelections();
      setSharedMcpCount(sharedMcp.length);
    } catch (error) {
      console.error("[ACP] settings error:", error);
    } finally {
      setLoading(false);
    }
  }, [configPresenter]);

  useEffect(() => {
    loadAcpData();
    const handler = () => {
      const timer = setTimeout(() => loadAcpData(), 80);
      return () => clearTimeout(timer);
    };
    window.electron?.ipcRenderer?.on(CONFIG_EVENTS.AGENTS_CHANGED, handler);
    return () => {
      window.electron?.ipcRenderer?.removeListener(CONFIG_EVENTS.AGENTS_CHANGED, handler);
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
          </div>
        )}

        <Separator />
      </div>

      <div className="flex-1 overflow-y-auto">
        {acpEnabled ? (
          <div className="p-4 space-y-6">
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
                            <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {agent.description || `Built-in ${agent.name} agent`}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              checked={agent.enabled}
                              disabled={Boolean(agentPending[agent.id])}
                              onCheckedChange={async (value) => {
                                setAgentPending((p) => ({ ...p, [agent.id]: true }));
                                try {
                                  await configPresenter.setAcpAgentEnabled(agent.id, value);
                                  await loadAcpData();
                                } catch (error) {
                                  console.error(error);
                                } finally {
                                  setAgentPending((p) => {
                                    const next = { ...p };
                                    delete next[agent.id];
                                    return next;
                                  });
                                }
                              }}
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
              </div>

              <CollapsibleContent className="space-y-3">
                {!manualAgents.length ? (
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
                                setAgentPending((p) => ({ ...p, [agent.id]: true }));
                                try {
                                  await configPresenter.updateManualAcpAgent(agent.id, {
                                    enabled: value,
                                  });
                                  await loadAcpData();
                                } finally {
                                  setAgentPending((p) => {
                                    const next = { ...p };
                                    delete next[agent.id];
                                    return next;
                                  });
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
    </div>
  );
}
