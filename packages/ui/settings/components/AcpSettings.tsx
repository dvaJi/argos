import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { configAgentsChangedEvent } from "@argos/shared-contracts/events";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Input } from "#shadcn/components/ui/input";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Switch } from "#shadcn/components/ui/switch";
import { Collapsible, CollapsibleContent } from "#shadcn/components/ui/collapsible";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "#shadcn/components/ui/alert";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
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
import type { AcpAgentInstallState, AcpManualAgent, AcpRegistryAgent } from "@argos/shared/presenter";
import type { AgentTransferImpact } from "@argos/shared/types/agent-interface";
import { createConfigClient } from "#api/ConfigClient";
import { createSessionClient } from "#api/SessionClient";
import { getArgosBridge } from "#api/core";
import { toast } from "#/components/use-toast";
import {
  getAgentsWithUpdates,
  getInstalledVersion,
  hasAgentUpdate,
  isPackageAgent,
  updateAgentsSequentially,
} from "#/lib/acpAgentUpdates";
import AcpDebugDialog from "./AcpDebugDialog";
import AcpDiagnostics from "./AcpDiagnostics";
import AcpAgentIcon from "#/components/icons/AcpAgentIcon";
import AgentMcpSelector from "#/components/mcp-config/AgentMcpSelector";
import AgentTransferDialog, { type TransferDialogAgent } from "#/components/agent/AgentTransferDialog";

const sessionClient = createSessionClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PendingKind = "toggle" | "install" | "update" | "repair" | "env" | "uninstall";
type RegistryFilter = "all" | "installed" | "available" | "updates";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const showError = (title: string, error: unknown) => {
  console.error(`[ACP] ${title}:`, error);
  toast({ title, description: errorMessage(error), variant: "destructive" });
};

/** ensure/repair can *return* an error state instead of throwing — treat it as a failure. */
const assertInstalled = (state: AcpAgentInstallState) => {
  if (state.status === "error") throw new Error(state.error ?? "Installation failed");
  return state;
};

const parseEnvBlock = (value: string): Record<string, string> =>
  Object.fromEntries(
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

const stringifyEnvBlock = (env?: Record<string, string>) =>
  Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

const buildPreviewCommand = (agent: AcpRegistryAgent) => {
  const withArgs = (cmd: string, args?: string[]) => (args?.length ? `${cmd} ${args.join(" ")}` : cmd);
  const { binary, npx, uvx } = agent.distribution;
  const firstBinary = binary ? Object.values(binary)[0] : undefined;
  if (firstBinary) return withArgs(firstBinary.cmd, firstBinary.args);
  if (npx) return withArgs(`npx -y ${npx.package}`, npx.args);
  if (uvx) return withArgs(`uvx ${uvx.package}`, uvx.args);
  return "—";
};

const distributionLabel = (agent: AcpRegistryAgent) => {
  if (agent.distribution.binary) return "Binary";
  if (agent.distribution.npx) return "npx";
  if (agent.distribution.uvx) return "uvx";
  return "Unknown";
};

const installStatus = (agent: AcpRegistryAgent) => agent.installState?.status ?? "not_installed";

/** Anything Argos has touched (installed, mid-install, or failed) belongs in the main list. */
const isOnDevice = (agent: AcpRegistryAgent) => installStatus(agent) !== "not_installed";

const versionLine = (agent: AcpRegistryAgent) => {
  const installed = getInstalledVersion(agent);
  return installed ? `v${installed}` : `v${agent.version}`;
};

const updateSuccessToast = (agent: AcpRegistryAgent) =>
  toast({
    title: `${agent.name} updated to v${agent.version}`,
    description: isPackageAgent(agent)
      ? "The new package version is used the next time the agent starts."
      : "The new version is installed and ready.",
  });

const usePendingMap = () => {
  const [pending, setPending] = useState<Record<string, PendingKind>>({});
  const start = useCallback((id: string, kind: PendingKind) => setPending((p) => ({ ...p, [id]: kind })), []);
  const stop = useCallback(
    (id: string) =>
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      }),
    [],
  );
  const run = useCallback(
    async (id: string, kind: PendingKind, task: () => Promise<void>) => {
      start(id, kind);
      // Tasks report their own errors; this only guarantees the row unlocks.
      await task().catch((error: unknown) => console.error("[ACP] action failed:", error));
      stop(id);
    },
    [start, stop],
  );
  return { pending, run };
};

// ---------------------------------------------------------------------------
// Data controller
// ---------------------------------------------------------------------------

type AcpData = {
  enabled: boolean;
  registryAgents: AcpRegistryAgent[];
  manualAgents: AcpManualAgent[];
  sharedMcpCount: number;
  loadError: string | null;
  loaded: boolean;
};

const initialAcpData: AcpData = {
  enabled: false,
  registryAgents: [],
  manualAgents: [],
  sharedMcpCount: 0,
  loadError: null,
  loaded: false,
};

const useAcpSettingsController = () => {
  const configClient = useMemo(() => createConfigClient(), []);
  const [data, setData] = useState<AcpData>(initialAcpData);
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  /** Agent currently being processed by "Update all". */
  const [bulkUpdatingId, setBulkUpdatingId] = useState<string | null>(null);
  /** Only agents the user has edited; untouched agents render their saved env. */
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [connectionCheckRequests, setConnectionCheckRequests] = useState<Record<string, number>>({});
  const { pending, run } = usePendingMap();

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const enabled = await configClient.getAcpEnabled();
      if (!enabled) {
        if (seq === loadSeq.current) setData({ ...initialAcpData, enabled: false, loaded: true });
        return;
      }
      const [registryAgents, manualAgents, sharedMcp] = await Promise.all([
        configClient.listAcpRegistryAgents(),
        configClient.listManualAcpAgents(),
        configClient.getAcpSharedMcpSelections(),
      ]);
      if (seq !== loadSeq.current) return;
      setData({
        enabled: true,
        registryAgents,
        manualAgents,
        sharedMcpCount: sharedMcp.length,
        loadError: null,
        loaded: true,
      });
    } catch (error) {
      console.error("[ACP] settings load error:", error);
      if (seq === loadSeq.current) setData((d) => ({ ...d, loadError: errorMessage(error), loaded: true }));
    }
  }, [configClient]);

  // Subscribe once. The desktop shell broadcasts config.agents.changed after
  // agent mutations; every action below also reloads explicitly.
  useEffect(() => {
    queueMicrotask(() => void load());
    const off = getArgosBridge().on(configAgentsChangedEvent.name, () => void load());
    return () => off?.();
  }, [load]);

  const requestConnectionCheck = (id: string) => setConnectionCheckRequests((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const consumeConnectionCheckRequest = (id: string, request: number) =>
    setConnectionCheckRequests((c) => (c[id] === request ? { ...c, [id]: 0 } : c));

  const setAcpEnabled = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await configClient.setAcpEnabled(enabled);
      await load();
    } catch (error) {
      showError(enabled ? "Could not enable ACP" : "Could not disable ACP", error);
    }
    setToggling(false);
  };

  const refreshRegistry = async () => {
    setRefreshing(true);
    try {
      await configClient.refreshAcpRegistry(true);
      await load();
    } catch (error) {
      showError("Registry could not be refreshed", error);
    }
    setRefreshing(false);
  };

  const setRegistryAgentEnabled = (agent: AcpRegistryAgent, enabled: boolean) =>
    run(agent.id, "toggle", async () => {
      try {
        await configClient.setAcpAgentEnabled(agent.id, enabled);
        if (enabled) requestConnectionCheck(agent.id);
      } catch (error) {
        showError(enabled ? `${agent.name} could not be enabled` : `${agent.name} could not be disabled`, error);
      }
      await load();
    });

  const installAgent = (agent: AcpRegistryAgent) =>
    run(agent.id, "install", async () => {
      try {
        assertInstalled(await configClient.ensureAcpAgentInstalled(agent.id));
        await configClient.setAcpAgentEnabled(agent.id, true);
        requestConnectionCheck(agent.id);
        toast({ title: `${agent.name} installed`, description: "It is enabled and its connection is being checked." });
      } catch (error) {
        showError(`${agent.name} could not be installed`, error);
      }
      await load();
    });

  const repairAgent = (agent: AcpRegistryAgent) =>
    run(agent.id, "repair", async () => {
      try {
        assertInstalled(await configClient.repairAcpAgent(agent.id));
        if (agent.enabled) requestConnectionCheck(agent.id);
        toast({ title: `${agent.name} repaired` });
      } catch (error) {
        showError(`${agent.name} could not be repaired`, error);
      }
      await load();
    });

  const updateAgent = (agent: AcpRegistryAgent) =>
    run(agent.id, "update", async () => {
      const [outcome] = await updateAgentsSequentially([agent], (id) => configClient.updateAcpAgent(id));
      if (outcome.ok) {
        updateSuccessToast(agent);
        if (agent.enabled) requestConnectionCheck(agent.id);
      } else {
        showError(`${agent.name} could not be updated`, outcome.error);
      }
      await load();
    });

  const updateAll = async () => {
    const targets = getAgentsWithUpdates(data.registryAgents);
    if (!targets.length || updatingAll) return;
    setUpdatingAll(true);
    const outcomes = await updateAgentsSequentially(
      targets,
      (id) => configClient.updateAcpAgent(id),
      // Mark each row as it is processed so the user sees progress.
      (agent) => setBulkUpdatingId(agent.id),
    );
    setBulkUpdatingId(null);
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length === 0) {
      toast({ title: `${targets.length} agent${targets.length === 1 ? "" : "s"} updated` });
    } else {
      toast({
        title: `${failed.length} of ${targets.length} updates failed`,
        description: failed.map((o) => `${o.agent.name}: ${o.ok ? "" : o.error}`).join("\n"),
        variant: "destructive",
        duration: 10_000,
      });
    }
    await load();
    setUpdatingAll(false);
  };

  const getEnvValue = (agent: AcpRegistryAgent) => envDrafts[agent.id] ?? stringifyEnvBlock(agent.envOverride);
  const isEnvDirty = (agent: AcpRegistryAgent) =>
    agent.id in envDrafts && envDrafts[agent.id] !== stringifyEnvBlock(agent.envOverride);
  const setEnvDraft = (id: string, value: string) => setEnvDrafts((d) => ({ ...d, [id]: value }));
  const discardEnvDraft = (id: string) =>
    setEnvDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const saveEnv = (agent: AcpRegistryAgent, value: string) =>
    run(agent.id, "env", async () => {
      try {
        await configClient.setAcpAgentEnvOverride(agent.id, parseEnvBlock(value));
        discardEnvDraft(agent.id);
        toast({ title: `${agent.name} environment saved` });
      } catch (error) {
        showError("Environment could not be saved", error);
      }
      await load();
    });

  const setManualAgentEnabled = (agent: AcpManualAgent, enabled: boolean) =>
    run(agent.id, "toggle", async () => {
      try {
        await configClient.updateManualAcpAgent(agent.id, { enabled });
        if (enabled) requestConnectionCheck(agent.id);
      } catch (error) {
        showError(enabled ? `${agent.name} could not be enabled` : `${agent.name} could not be disabled`, error);
      }
      await load();
    });

  const deleteManualAgent = async (agent: AcpManualAgent) => {
    try {
      await configClient.removeManualAcpAgent(agent.id);
      toast({ title: `${agent.name} removed` });
    } catch (error) {
      showError(`${agent.name} could not be removed`, error);
    }
    await load();
  };

  const saveManualAgent = async (draft: ManualAgentDraft): Promise<boolean> => {
    const args = draft.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      name: draft.name.trim(),
      command: draft.command.trim(),
      args: args.length ? args : undefined,
      env: parseEnvBlock(draft.env),
      enabled: draft.enabled,
    };
    try {
      if (draft.editId) {
        const wasEnabled = Boolean(data.manualAgents.find((a) => a.id === draft.editId)?.enabled);
        await configClient.updateManualAcpAgent(draft.editId, payload);
        if (payload.enabled && !wasEnabled) requestConnectionCheck(draft.editId);
      } else {
        const added = await configClient.addManualAcpAgent(payload);
        if (payload.enabled) requestConnectionCheck(added.id);
      }
      toast({ title: `${payload.name} saved` });
      await load();
      return true;
    } catch (error) {
      showError("Custom agent could not be saved", error);
      return false;
    }
  };

  return {
    configClient,
    data,
    setData,
    load,
    toggling,
    refreshing,
    updatingAll,
    bulkUpdatingId,
    pending,
    run,
    connectionCheckRequests,
    consumeConnectionCheckRequest,
    setAcpEnabled,
    refreshRegistry,
    setRegistryAgentEnabled,
    installAgent,
    repairAgent,
    updateAgent,
    updateAll,
    getEnvValue,
    isEnvDirty,
    setEnvDraft,
    discardEnvDraft,
    saveEnv,
    setManualAgentEnabled,
    deleteManualAgent,
    saveManualAgent,
  };
};

type Controller = ReturnType<typeof useAcpSettingsController>;

// ---------------------------------------------------------------------------
// Uninstall flow (registry agents may own conversations that must move first)
// ---------------------------------------------------------------------------

const useUninstallFlow = (controller: Controller) => {
  const { configClient, load, run } = controller;
  const [agent, setAgent] = useState<AcpRegistryAgent | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [impact, setImpact] = useState<AgentTransferImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [targets, setTargets] = useState<TransferDialogAgent[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  // Guards against a slow impact lookup overwriting a newer selection.
  const requestRef = useRef(0);

  const lookupImpact = (target: AcpRegistryAgent) => {
    const request = ++requestRef.current;
    setImpact(null);
    setImpactError(null);
    setImpactLoading(true);
    void Promise.all([sessionClient.getAgentTransferImpact(target.id), configClient.listAgents()])
      .then(([nextImpact, agents]) => {
        if (request !== requestRef.current) return;
        setImpact(nextImpact);
        setTargets(agents ?? []);
      })
      .catch((error) => {
        console.warn("[ACP] uninstall impact lookup failed:", error);
        if (request !== requestRef.current) return;
        // Fail closed: a failed lookup must not read as "no conversations".
        setImpactError(errorMessage(error));
      })
      .finally(() => {
        if (request === requestRef.current) setImpactLoading(false);
      });
  };

  const open = (target: AcpRegistryAgent) => {
    setAgent(target);
    setTransferError(null);
    setConfirmOpen(true);
    lookupImpact(target);
  };

  const finish = () => {
    requestRef.current++;
    setConfirmOpen(false);
    setTransferOpen(false);
    setAgent(null);
    setImpact(null);
    setImpactError(null);
    setTransferError(null);
  };

  const confirm = async () => {
    const target = agent;
    if (!target || impactLoading || impactError) return;
    if ((impact?.totalSessions ?? 0) > 0) {
      setConfirmOpen(false);
      setTransferOpen(true);
      return;
    }
    setConfirmOpen(false);
    await run(target.id, "uninstall", async () => {
      try {
        await configClient.uninstallAcpRegistryAgent(target.id);
        toast({ title: `${target.name} uninstalled` });
      } catch (error) {
        showError(`${target.name} could not be uninstalled`, error);
      }
      await load();
    });
    finish();
  };

  const withSessions = async (settle: (agentId: string) => Promise<unknown>) => {
    const target = agent;
    if (!target) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      await settle(target.id);
      await configClient.uninstallAcpRegistryAgent(target.id);
      await load();
      finish();
      toast({ title: `${target.name} uninstalled` });
    } catch (error) {
      setTransferError(errorMessage(error));
    }
    setTransferBusy(false);
  };

  return {
    agent,
    confirmOpen,
    setConfirmOpen,
    transferOpen,
    setTransferOpen,
    impact,
    impactLoading,
    impactError,
    targets,
    transferBusy,
    transferError,
    open,
    retry: () => agent && lookupImpact(agent),
    confirm,
    moveAndUninstall: (targetAgentId: string) =>
      withSessions((id) => sessionClient.moveAgentSessions(id, targetAgentId)),
    deleteAndUninstall: () => withSessions((id) => sessionClient.deleteAgentSessions(id)),
  };
};

// ---------------------------------------------------------------------------
// Custom agent dialog state
// ---------------------------------------------------------------------------

type ManualAgentDraft = {
  open: boolean;
  editId: string;
  name: string;
  command: string;
  argsText: string;
  env: string;
  enabled: boolean;
};

type ManualAgentDraftAction =
  | { type: "OPEN"; agent?: AcpManualAgent }
  | { type: "CLOSE" }
  | { type: "SET"; patch: Partial<Omit<ManualAgentDraft, "open" | "editId">> };

const initialManualDraft: ManualAgentDraft = {
  open: false,
  editId: "",
  name: "",
  command: "",
  argsText: "",
  env: "",
  enabled: true,
};

const manualDraftReducer = (state: ManualAgentDraft, action: ManualAgentDraftAction): ManualAgentDraft => {
  switch (action.type) {
    case "OPEN":
      return {
        open: true,
        editId: action.agent?.id ?? "",
        name: action.agent?.name ?? "",
        command: action.agent?.command ?? "",
        argsText: (action.agent?.args ?? []).join("\n"),
        env: stringifyEnvBlock(action.agent?.env),
        enabled: action.agent?.enabled ?? true,
      };
    case "CLOSE":
      return { ...state, open: false };
    case "SET":
      return { ...state, ...action.patch };
  }
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AcpSettings() {
  const controller = useAcpSettingsController();
  const uninstall = useUninstallFlow(controller);
  const { data } = controller;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [registryOpen, setRegistryOpen] = useState(false);
  const [debugTarget, setDebugTarget] = useState<{ id: string; name: string } | null>(null);
  const [manualDraft, dispatchManualDraft] = useReducer(manualDraftReducer, initialManualDraft);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualToDelete, setManualToDelete] = useState<AcpManualAgent | null>(null);

  const installedAgents = data.registryAgents.filter(isOnDevice);
  const updates = getAgentsWithUpdates(data.registryAgents);
  const loading = !data.loaded;

  const openRegistry = () => setRegistryOpen(true);

  const saveManualAgent = async () => {
    if (!manualDraft.name.trim() || !manualDraft.command.trim()) {
      toast({ title: "Name and command are required", variant: "destructive" });
      return;
    }
    setManualSaving(true);
    const ok = await controller.saveManualAgent(manualDraft);
    setManualSaving(false);
    if (ok) dispatchManualDraft({ type: "CLOSE" });
  };

  return (
    <div data-testid="settings-acp-page" className="flex size-full flex-col">
      <PageHeader enabled={data.enabled} toggling={controller.toggling} onToggle={controller.setAcpEnabled} />

      <div className="flex-1 overflow-y-auto">
        {!data.enabled && data.loaded ? (
          <AcpDisabledState toggling={controller.toggling} onEnable={() => void controller.setAcpEnabled(true)} />
        ) : (
          <div className="flex flex-col gap-8 p-4">
            {data.loadError && (
              <Alert variant="destructive">
                <Icon icon="lucide:triangle-alert" />
                <AlertTitle>Agents could not be loaded</AlertTitle>
                <AlertDescription>{data.loadError}</AlertDescription>
                <AlertAction>
                  <Button size="sm" variant="outline" onClick={() => void controller.load()}>
                    Retry
                  </Button>
                </AlertAction>
              </Alert>
            )}

            {updates.length > 0 && (
              <UpdatesBanner
                agents={updates}
                updatingAll={controller.updatingAll}
                onUpdateAll={() => void controller.updateAll()}
              />
            )}

            <section className="flex flex-col gap-3" aria-labelledby="acp-installed-heading">
              <SectionHeader
                id="acp-installed-heading"
                title="Installed agents"
                description="Agents from the ACP registry that Argos installs and keeps up to date."
                action={
                  <Button size="sm" onClick={() => openRegistry()}>
                    <Icon icon="lucide:download" />
                    Browse registry
                  </Button>
                }
              />
              {loading ? (
                <ListSkeleton />
              ) : installedAgents.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Icon icon="lucide:bot" />
                    </EmptyMedia>
                    <EmptyTitle>No agents installed</EmptyTitle>
                    <EmptyDescription>
                      Pick an agent from the registry. Argos installs it, enables it and checks the connection.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={() => openRegistry()}>
                      <Icon icon="lucide:download" />
                      Browse registry
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="divide-y overflow-hidden rounded-xl border bg-card">
                  {installedAgents.map((agent) => (
                    <InstalledAgentRow
                      key={agent.id}
                      agent={agent}
                      controller={controller}
                      expanded={Boolean(expanded[agent.id])}
                      onExpandedChange={(open) => setExpanded((e) => ({ ...e, [agent.id]: open }))}
                      onOpenDebug={() => setDebugTarget({ id: agent.id, name: agent.name })}
                      onUninstall={() => uninstall.open(agent)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="acp-custom-heading">
              <SectionHeader
                id="acp-custom-heading"
                title="Custom agents"
                description="Run any ACP-compatible command that is not in the registry."
                action={
                  <Button size="sm" variant="outline" onClick={() => dispatchManualDraft({ type: "OPEN" })}>
                    <Icon icon="lucide:plus" />
                    Add custom agent
                  </Button>
                }
              />
              {loading ? (
                <Skeleton className="h-16 w-full rounded-xl" />
              ) : data.manualAgents.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
                  No custom agents yet.
                </p>
              ) : (
                <div className="divide-y overflow-hidden rounded-xl border bg-card">
                  {data.manualAgents.map((agent) => (
                    <ManualAgentRow
                      key={agent.id}
                      agent={agent}
                      controller={controller}
                      onEdit={() => dispatchManualDraft({ type: "OPEN", agent })}
                      onOpenDebug={() => setDebugTarget({ id: agent.id, name: agent.name })}
                      onDelete={() => setManualToDelete(agent)}
                    />
                  ))}
                </div>
              )}
            </section>

            {(installedAgents.length > 0 || data.manualAgents.length > 0) && (
              <SharedMcpSection
                count={data.sharedMcpCount}
                onCountChange={(count) =>
                  controller.setData((d) => (d.sharedMcpCount === count ? d : { ...d, sharedMcpCount: count }))
                }
              />
            )}
          </div>
        )}
      </div>

      <ManualAgentDialog
        state={manualDraft}
        dispatch={dispatchManualDraft}
        saving={manualSaving}
        onSave={() => void saveManualAgent()}
      />

      <RegistryDialog open={registryOpen} onOpenChange={setRegistryOpen} controller={controller} />

      <AlertDialog open={Boolean(manualToDelete)} onOpenChange={(open) => !open && setManualToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {manualToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The custom agent configuration will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = manualToDelete;
                setManualToDelete(null);
                if (target) void controller.deleteManualAgent(target);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UninstallAlertDialog flow={uninstall} />

      <AgentTransferDialog
        open={uninstall.transferOpen}
        mode="delete-agent"
        sourceAgentId={uninstall.agent?.id ?? ""}
        sourceAgentName={uninstall.agent?.name ?? ""}
        agents={uninstall.targets}
        impact={uninstall.impact}
        loading={uninstall.impactLoading}
        busy={uninstall.transferBusy}
        error={uninstall.transferError}
        title={uninstall.agent ? `Uninstall ${uninstall.agent.name}` : undefined}
        // Settlement handles active/queued sessions during the move or
        // delete, so pre-computed "blocked" samples must not gate the flow.
        allowBlocked
        onOpenChange={uninstall.setTransferOpen}
        onConfirmMove={(payload) => void uninstall.moveAndUninstall(payload.targetAgentId)}
        onConfirmDelete={() => void uninstall.deleteAndUninstall()}
      />

      <AcpDebugDialog
        open={Boolean(debugTarget)}
        agentId={debugTarget?.id ?? ""}
        agentName={debugTarget?.name ?? ""}
        onOpenChange={(open) => !open && setDebugTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

const PageHeader = ({
  enabled,
  toggling,
  onToggle,
}: {
  enabled: boolean;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
}) => (
  <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="text-lg font-semibold tracking-tight">ACP agents</h1>
      <p className="text-sm text-muted-foreground">
        Use external coding agents (Claude Code, Codex, Gemini, …) through the Agent Client Protocol.
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2 pt-1">
      {toggling && <Spinner />}
      <label htmlFor="acp-master-switch" className="text-sm text-muted-foreground">
        {enabled ? "On" : "Off"}
      </label>
      <Switch
        id="acp-master-switch"
        aria-label="Enable Agent Client Protocol"
        dir="ltr"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={toggling}
      />
    </div>
  </div>
);

const AcpDisabledState = ({ toggling, onEnable }: { toggling: boolean; onEnable: () => void }) => (
  <Empty className="m-4 border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon icon="lucide:plug-zap" />
      </EmptyMedia>
      <EmptyTitle>ACP agents are turned off</EmptyTitle>
      <EmptyDescription>Turn on ACP to install agents from the registry or add your own.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button disabled={toggling} onClick={onEnable}>
        {toggling ? <Spinner /> : <Icon icon="lucide:power" />}
        Turn on ACP
      </Button>
    </EmptyContent>
  </Empty>
);

const SectionHeader = ({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-end justify-between gap-4">
    <div className="min-w-0">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
);

const ListSkeleton = () => (
  <div className="flex flex-col overflow-hidden rounded-xl border" aria-label="Loading agents">
    {[0, 1].map((item) => (
      <div key={item} className="flex items-center gap-3 border-b px-3 py-4 last:border-b-0">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="h-5 w-9 rounded-full" />
      </div>
    ))}
  </div>
);

const UpdatesBanner = ({
  agents,
  updatingAll,
  onUpdateAll,
}: {
  agents: AcpRegistryAgent[];
  updatingAll: boolean;
  onUpdateAll: () => void;
}) => (
  <Alert className="border-amber-500/40 bg-amber-500/5">
    <Icon icon="lucide:arrow-up-circle" className="text-amber-600" />
    <AlertTitle>
      {agents.length === 1 ? "1 agent update available" : `${agents.length} agent updates available`}
    </AlertTitle>
    <AlertDescription className="pr-28">
      {agents.map((agent) => `${agent.name} ${versionLine(agent)} → v${agent.version}`).join(" · ")}
    </AlertDescription>
    <AlertAction>
      <Button size="sm" disabled={updatingAll} onClick={onUpdateAll}>
        {updatingAll ? <Spinner /> : <Icon icon="lucide:download" />}
        {agents.length === 1 ? "Update" : "Update all"}
      </Button>
    </AlertAction>
  </Alert>
);

const UpdateButton = ({
  agent,
  busy,
  disabled,
  onUpdate,
}: {
  agent: AcpRegistryAgent;
  busy: boolean;
  disabled: boolean;
  onUpdate: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
          disabled={disabled}
          onClick={onUpdate}
        />
      }
    >
      {busy ? <Spinner /> : <Icon icon="lucide:arrow-up-circle" />}
      {busy ? "Updating" : `Update to v${agent.version}`}
    </TooltipTrigger>
    <TooltipContent>
      {isPackageAgent(agent)
        ? `${distributionLabel(agent)} package — the new version is fetched the next time the agent starts.`
        : "Downloads and installs the new version."}
    </TooltipContent>
  </Tooltip>
);

// ---------------------------------------------------------------------------
// Installed registry agent row
// ---------------------------------------------------------------------------

const InstalledAgentRow = ({
  agent,
  controller,
  expanded,
  onExpandedChange,
  onOpenDebug,
  onUninstall,
}: {
  agent: AcpRegistryAgent;
  controller: Controller;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onOpenDebug: () => void;
  onUninstall: () => void;
}) => {
  const pendingKind = controller.pending[agent.id];
  const busy = Boolean(pendingKind) || controller.updatingAll;
  const status = installStatus(agent);
  const updateAvailable = hasAgentUpdate(agent);
  const envValue = controller.getEnvValue(agent);
  const envDirty = controller.isEnvDirty(agent);

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange}>
      <article>
        <div className="flex items-center gap-3 px-3 py-3">
          <AcpAgentIcon
            agentId={agent.id}
            icon={agent.icon}
            alt={agent.name}
            fallbackText={agent.name}
            customClass="size-8 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
              {status === "error" && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  Needs repair
                </Badge>
              )}
              {status === "installing" && <Badge variant="outline">Installing</Badge>}
              {status === "installed" && !agent.enabled && <Badge variant="outline">Off</Badge>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {versionLine(agent)}
              {updateAvailable && (
                <span className="text-amber-700 dark:text-amber-400"> · v{agent.version} available</span>
              )}
              {" · "}
              {distributionLabel(agent)}
              {agent.description ? ` · ${agent.description}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {updateAvailable && (
              <UpdateButton
                agent={agent}
                busy={pendingKind === "update" || controller.bulkUpdatingId === agent.id}
                disabled={busy}
                onUpdate={() => void controller.updateAgent(agent)}
              />
            )}
            {status === "error" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void controller.repairAgent(agent)}>
                {pendingKind === "repair" ? <Spinner /> : <Icon icon="lucide:wrench" />}
                Repair
              </Button>
            )}
            <div className="flex items-center px-1.5">
              <Switch
                aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                checked={agent.enabled}
                disabled={busy || status !== "installed"}
                onCheckedChange={(value) => void controller.setRegistryAgentEnabled(agent, value)}
              />
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${expanded ? "Hide" : "Show"} ${agent.name} settings`}
                    aria-expanded={expanded}
                    onClick={() => onExpandedChange(!expanded)}
                  />
                }
              >
                <Icon icon={expanded ? "lucide:chevron-up" : "lucide:settings-2"} />
              </TooltipTrigger>
              <TooltipContent>{expanded ? "Hide settings" : "Settings"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {status === "error" && agent.installState?.error && (
          <p className="mx-3 mb-3 rounded-md bg-destructive/10 px-2.5 py-1.5 font-mono text-xs break-words text-destructive">
            {agent.installState.error}
          </p>
        )}

        <AcpDiagnostics
          agentId={agent.id}
          agentName={agent.name}
          launchSource={agent.source}
          canRun={agent.enabled && status === "installed"}
          autoCheckRequest={controller.connectionCheckRequests[agent.id] ?? 0}
          onAutoCheckHandled={(request) => controller.consumeConnectionCheckRequest(agent.id, request)}
        />

        <CollapsibleContent>
          <div className="flex flex-col gap-4 border-t bg-muted/20 px-3 py-4">
            <dl className="grid gap-3 text-xs sm:grid-cols-4">
              <DetailItem
                label="Installed"
                value={getInstalledVersion(agent) ? `v${getInstalledVersion(agent)}` : "—"}
              />
              <DetailItem label="Latest" value={`v${agent.version}`} />
              <DetailItem label="Agent ID" value={agent.id} mono />
              <DetailItem label="Command" value={buildPreviewCommand(agent)} mono />
            </dl>

            <Field>
              <FieldLabel htmlFor={`acp-env-${agent.id}`}>Environment variables</FieldLabel>
              <Textarea
                id={`acp-env-${agent.id}`}
                value={envValue}
                onChange={(event) => controller.setEnvDraft(agent.id, event.target.value)}
                className="min-h-24 font-mono text-xs"
                placeholder="API_KEY=value"
              />
              <FieldDescription>One KEY=value per line. Passed to the agent process when it starts.</FieldDescription>
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy || !envDirty} onClick={() => void controller.saveEnv(agent, envValue)}>
                {pendingKind === "env" && <Spinner />}
                Save environment
              </Button>
              {envDirty && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => controller.discardEnvDraft(agent.id)}>
                  Discard changes
                </Button>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!agent.enabled || busy}
                  title={agent.enabled ? undefined : "Enable this agent first"}
                  onClick={onOpenDebug}
                >
                  <Icon icon="lucide:bug" />
                  Debug console
                </Button>
                {status !== "error" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void controller.repairAgent(agent)}>
                    {pendingKind === "repair" ? <Spinner /> : <Icon icon="lucide:wrench" />}
                    Reinstall
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={onUninstall}
                >
                  <Icon icon="lucide:trash-2" />
                  Uninstall
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
};

const DetailItem = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="min-w-0">
    <dt className="font-medium text-foreground">{label}</dt>
    <dd className={`truncate text-muted-foreground ${mono ? "font-mono" : ""}`} title={value}>
      {value}
    </dd>
  </div>
);

// ---------------------------------------------------------------------------
// Custom agent row + dialog
// ---------------------------------------------------------------------------

const ManualAgentRow = ({
  agent,
  controller,
  onEdit,
  onOpenDebug,
  onDelete,
}: {
  agent: AcpManualAgent;
  controller: Controller;
  onEdit: () => void;
  onOpenDebug: () => void;
  onDelete: () => void;
}) => {
  const busy = Boolean(controller.pending[agent.id]);
  return (
    <article>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon icon="lucide:terminal-square" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
            {!agent.enabled && <Badge variant="outline">Off</Badge>}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {[agent.command, ...(agent.args ?? [])].join(" ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center px-1.5">
            <Switch
              aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
              checked={agent.enabled}
              disabled={busy}
              onCheckedChange={(value) => void controller.setManualAgentEnabled(agent, value)}
            />
          </div>
          <IconAction icon="lucide:pencil" label={`Edit ${agent.name}`} tooltip="Edit" onClick={onEdit} />
          <IconAction
            icon="lucide:bug"
            label={`Open ${agent.name} debug console`}
            tooltip={agent.enabled ? "Debug console" : "Enable the agent first"}
            disabled={!agent.enabled}
            onClick={onOpenDebug}
          />
          <IconAction
            icon="lucide:trash-2"
            label={`Delete ${agent.name}`}
            tooltip="Remove"
            destructive
            onClick={onDelete}
          />
        </div>
      </div>
      <AcpDiagnostics
        agentId={agent.id}
        agentName={agent.name}
        launchSource={agent.source}
        canRun={agent.enabled}
        autoCheckRequest={controller.connectionCheckRequests[agent.id] ?? 0}
        onAutoCheckHandled={(request) => controller.consumeConnectionCheckRequest(agent.id, request)}
      />
    </article>
  );
};

const IconAction = ({
  icon,
  label,
  tooltip,
  disabled,
  destructive,
  onClick,
}: {
  icon: string;
  label: string;
  tooltip: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          className={destructive ? "text-destructive hover:text-destructive" : undefined}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        />
      }
    >
      <Icon icon={icon} />
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

const ManualAgentDialog = ({
  state,
  dispatch,
  saving,
  onSave,
}: {
  state: ManualAgentDraft;
  dispatch: React.Dispatch<ManualAgentDraftAction>;
  saving: boolean;
  onSave: () => void;
}) => (
  <Dialog open={state.open} onOpenChange={(open) => !open && dispatch({ type: "CLOSE" })}>
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>{state.editId ? "Edit custom agent" : "Add custom agent"}</DialogTitle>
        <DialogDescription>Any command that speaks the Agent Client Protocol over stdio.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="acp-manual-name">Name</FieldLabel>
          <Input
            id="acp-manual-name"
            value={state.name}
            onChange={(e) => dispatch({ type: "SET", patch: { name: e.target.value } })}
            placeholder="My agent"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="acp-manual-command">Command</FieldLabel>
          <Input
            id="acp-manual-command"
            value={state.command}
            onChange={(e) => dispatch({ type: "SET", patch: { command: e.target.value } })}
            className="font-mono"
            placeholder="npx"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="acp-manual-args">Arguments</FieldLabel>
          <Textarea
            id="acp-manual-args"
            value={state.argsText}
            onChange={(e) => dispatch({ type: "SET", patch: { argsText: e.target.value } })}
            className="min-h-[80px] font-mono text-xs"
            placeholder={"-y\nmy-acp-agent\n--acp"}
          />
          <FieldDescription>One argument per line.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="acp-manual-env">Environment variables</FieldLabel>
          <Textarea
            id="acp-manual-env"
            value={state.env}
            onChange={(e) => dispatch({ type: "SET", patch: { env: e.target.value } })}
            className="min-h-[80px] font-mono text-xs"
            placeholder="API_KEY=value"
          />
          <FieldDescription>One KEY=value per line.</FieldDescription>
        </Field>
        <Field orientation="horizontal" className="rounded-lg border px-3 py-3">
          <div className="flex flex-1 flex-col gap-1">
            <FieldLabel htmlFor="acp-manual-enabled">Enabled</FieldLabel>
            <FieldDescription>Make the agent available in chats right away.</FieldDescription>
          </div>
          <Switch
            id="acp-manual-enabled"
            checked={state.enabled}
            onCheckedChange={(checked) => dispatch({ type: "SET", patch: { enabled: checked } })}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dispatch({ type: "CLOSE" })}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={onSave}>
          {saving && <Spinner />}
          {saving ? "Saving" : "Save agent"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------
// Shared MCP
// ---------------------------------------------------------------------------

const SharedMcpSection = ({ count, onCountChange }: { count: number; onCountChange: (count: number) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="overflow-hidden rounded-xl border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <div className="min-w-0">
            <span className="block text-sm font-semibold">Shared MCP servers</span>
            <p className="text-xs text-muted-foreground">
              MCP servers every ACP agent can use, in addition to its own.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">{count === 0 ? "None shared" : `${count} shared`}</Badge>
            <Icon icon={open ? "lucide:chevron-up" : "lucide:chevron-down"} className="size-4 text-muted-foreground" />
          </div>
        </button>
        <CollapsibleContent>
          <div className="border-t px-4 py-4">
            <AgentMcpSelector onUpdateSelections={(selections: string[]) => onCountChange(selections.length)} />
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
};

// ---------------------------------------------------------------------------
// Registry dialog
// ---------------------------------------------------------------------------

const RegistryDialog = ({
  open,
  onOpenChange,
  controller,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controller: Controller;
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("all");

  const all = controller.data.registryAgents;
  const counts: Record<RegistryFilter, number> = {
    all: all.length,
    installed: all.filter(isOnDevice).length,
    available: all.filter((a) => !isOnDevice(a)).length,
    updates: all.filter(hasAgentUpdate).length,
  };
  const keyword = search.trim().toLowerCase();
  const visible = all.filter((agent) => {
    if (
      keyword &&
      !agent.name.toLowerCase().includes(keyword) &&
      !agent.id.toLowerCase().includes(keyword) &&
      !(agent.description ?? "").toLowerCase().includes(keyword)
    ) {
      return false;
    }
    if (filter === "installed") return isOnDevice(agent);
    if (filter === "available") return !isOnDevice(agent);
    if (filter === "updates") return hasAgentUpdate(agent);
    return true;
  });

  const filters: Array<{ id: RegistryFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "installed", label: "Installed" },
    { id: "available", label: "Not installed" },
    { id: "updates", label: "Updates" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="overflow-hidden p-0 sm:max-w-[760px]">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader className="flex flex-col gap-4 border-b px-5 pt-5 pb-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <DialogTitle>ACP registry</DialogTitle>
                <DialogDescription>Install an agent and Argos enables it and checks its connection.</DialogDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controller.refreshing}
                  onClick={() => void controller.refreshRegistry()}
                >
                  {controller.refreshing ? <Spinner /> : <Icon icon="lucide:refresh-cw" />}
                  Check for updates
                </Button>
                <Button size="icon" variant="ghost" aria-label="Close" onClick={() => onOpenChange(false)}>
                  <Icon icon="lucide:x" />
                </Button>
              </div>
            </div>

            <div className="relative">
              <Icon
                icon="lucide:search"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                placeholder="Search agents"
              />
            </div>

            <div className="flex flex-wrap gap-2" role="tablist">
              {filters.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  role="tab"
                  aria-selected={filter === item.id}
                  variant={filter === item.id ? "default" : "outline"}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span className="text-xs opacity-70">{counts[item.id]}</span>
                </Button>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!controller.data.loaded ? (
              <ListSkeleton />
            ) : visible.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon icon={filter === "updates" ? "lucide:circle-check" : "lucide:search-x"} />
                  </EmptyMedia>
                  <EmptyTitle>
                    {filter === "updates" && !keyword ? "Everything is up to date" : "No matching agents"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {filter === "updates" && !keyword
                      ? "Use “Check for updates” to fetch the latest registry."
                      : "Try a different search or filter."}
                  </EmptyDescription>
                </EmptyHeader>
                {(keyword || filter !== "all") && (
                  <EmptyContent>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Show all agents
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              <div className="divide-y overflow-hidden rounded-xl border">
                {visible.map((agent) => (
                  <RegistryCatalogRow key={agent.id} agent={agent} controller={controller} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const RegistryCatalogRow = ({ agent, controller }: { agent: AcpRegistryAgent; controller: Controller }) => {
  const pendingKind = controller.pending[agent.id];
  const busy = Boolean(pendingKind) || controller.updatingAll;
  const status = installStatus(agent);
  const updateAvailable = hasAgentUpdate(agent);

  const primaryAction = (() => {
    if (status === "installing" || pendingKind === "install") {
      return (
        <Button size="sm" disabled>
          <Spinner />
          Installing
        </Button>
      );
    }
    if (status === "error") {
      return (
        <Button size="sm" disabled={busy} onClick={() => void controller.repairAgent(agent)}>
          {pendingKind === "repair" ? <Spinner /> : <Icon icon="lucide:wrench" />}
          Repair
        </Button>
      );
    }
    if (status === "not_installed") {
      return (
        <Button size="sm" disabled={busy} onClick={() => void controller.installAgent(agent)}>
          <Icon icon="lucide:download" />
          Install
        </Button>
      );
    }
    if (updateAvailable) {
      return (
        <UpdateButton
          agent={agent}
          busy={pendingKind === "update" || controller.bulkUpdatingId === agent.id}
          disabled={busy}
          onUpdate={() => void controller.updateAgent(agent)}
        />
      );
    }
    if (!agent.enabled) {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void controller.setRegistryAgentEnabled(agent, true)}
        >
          {pendingKind === "toggle" ? <Spinner /> : <Icon icon="lucide:power" />}
          Enable
        </Button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <Icon icon="lucide:check" className="size-3.5" />
        Installed
      </span>
    );
  })();

  return (
    <div className="flex items-start gap-3 bg-card px-3 py-3 transition-colors hover:bg-accent/30">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40">
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
            <span className="truncate text-sm font-semibold">{agent.name}</span>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {agent.description || `${agent.name} ACP agent`}
            </p>
          </div>
          <div className="shrink-0">{primaryAction}</div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {updateAvailable ? (
              <>
                {versionLine(agent)} → <span className="text-amber-700 dark:text-amber-400">v{agent.version}</span>
              </>
            ) : (
              `v${agent.version}`
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>{distributionLabel(agent)}</span>
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
  );
};

// ---------------------------------------------------------------------------
// Uninstall confirm
// ---------------------------------------------------------------------------

const UninstallAlertDialog = ({ flow }: { flow: ReturnType<typeof useUninstallFlow> }) => {
  const hasConversations = (flow.impact?.totalSessions ?? 0) > 0;
  return (
    <AlertDialog open={flow.confirmOpen} onOpenChange={flow.setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{flow.agent ? `Uninstall ${flow.agent.name}?` : "Uninstall agent?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {flow.impactError ? (
              <span className="text-destructive">Could not check conversations: {flow.impactError}</span>
            ) : flow.impactLoading ? (
              "Checking for related conversations…"
            ) : hasConversations ? (
              "This agent still has conversations. Next you can move them to another agent or delete them."
            ) : (
              "The agent and its settings will be removed. You can reinstall it from the registry later."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {flow.impactError ? <AlertDialogAction onClick={() => flow.retry()}>Retry</AlertDialogAction> : null}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!flow.agent || flow.impactLoading || Boolean(flow.impactError)}
            onClick={() => void flow.confirm()}
          >
            {flow.impactLoading && <Spinner />}
            {hasConversations ? "Continue" : "Uninstall"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
