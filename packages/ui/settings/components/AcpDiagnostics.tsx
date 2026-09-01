import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Input } from "#shadcn/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "#shadcn/components/ui/field";
import { Spinner } from "#shadcn/components/ui/spinner";
import { Collapsible, CollapsibleContent } from "#shadcn/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { cn } from "#shadcn/lib/utils";
import type { AcpAgentDiagnostics, AcpRemoteSessionSummary, AcpDebugRunResult } from "@argos/shared/presenter";
import { toast } from "#/components/use-toast";
import { createProviderClient } from "#api/ProviderClient";
// Process-wide singleton; module scope keeps effect dependencies stable.
const providerClient = createProviderClient();

interface AcpDiagnosticsProps {
  agentId: string;
  agentName: string;
  launchSource?: string | null;
  workdir?: string | null;
  canRun?: boolean;
  autoCheckRequest?: number;
  onAutoCheckHandled?: (request: number) => void;
}
type ConnectionState = "off" | "unchecked" | "checking" | "ready" | "auth" | "error";
type AuthMethod = AcpAgentDiagnostics["authMethods"][number];
type DiagnosticsCapabilities = AcpAgentDiagnostics["capabilities"];
type RunDebugAction = (action: string, payload?: Record<string, unknown>) => Promise<AcpDebugRunResult | null>;
const CAPABILITY_LABELS: Array<{
  key: keyof AcpAgentDiagnostics["capabilities"];
  label: string;
}> = [
  {
    key: "loadSession",
    label: "Load Session",
  },
  {
    key: "sessionList",
    label: "Session List",
  },
  {
    key: "sessionResume",
    label: "Resume",
  },
  {
    key: "sessionClose",
    label: "Close",
  },
  {
    key: "sessionFork",
    label: "Fork",
  },
  {
    key: "authLogout",
    label: "Logout",
  },
  {
    key: "fs",
    label: "File System",
  },
  {
    key: "terminal",
    label: "Terminal",
  },
];
const DIAGNOSTICS_TIMEOUT_MS = 20000;

/**
 * ACP adapters that wrap an external CLI. When the CLI is missing from PATH
 * the adapter process starts but its inner agent exits immediately, surfacing
 * as a generic "stream was destroyed" or "connection closed" error. This map
 * lets us show an actionable, agent-specific message instead.
 */
const ACP_ADAPTER_PREREQUISITES: Record<
  string,
  {
    cli: string;
    installHint?: string;
  }
> = {
  "pi-acp": {
    cli: "pi",
    installHint: "npm install -g @anthropic-ai/pi",
  },
  "claude-acp": {
    cli: "claude",
    installHint: "npm install -g @anthropic-ai/claude-code",
  },
  "codex-acp": {
    cli: "codex",
    installHint: "npm install -g @openai/codex",
  },
  "amp-acp": {
    cli: "amp",
  },
};
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Diagnostics timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
function extractRemoteSessions(result: AcpDebugRunResult): AcpRemoteSessionSummary[] {
  const sessions: AcpRemoteSessionSummary[] = [];
  for (const event of result.events ?? []) {
    const payload = event.payload as
      | {
          sessions?: Array<Record<string, unknown>>;
        }
      | undefined;
    if (Array.isArray(payload?.sessions)) {
      for (const session of payload.sessions) {
        const sessionId = typeof session.sessionId === "string" ? session.sessionId : undefined;
        if (!sessionId) continue;
        sessions.push({
          sessionId,
          title: typeof session.title === "string" ? session.title : undefined,
          updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : undefined,
          workdir: typeof session.workdir === "string" ? session.workdir : undefined,
        });
      }
    }
  }
  return sessions;
}
function getProbeErrorMessage(error: unknown, agentId?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Agent not found")) {
    return "This agent is not available to ACP. Enable it in Installed Agents, then try again.";
  }
  const prerequisite = agentId ? ACP_ADAPTER_PREREQUISITES[agentId] : undefined;
  const wrappedAgentDied = message.includes("stream was destroyed") || message.includes("ACP connection closed");
  if (prerequisite && wrappedAgentDied) {
    const install = prerequisite.installHint
      ? ` Install it with \`${prerequisite.installHint}\` and`
      : " Install it and";
    return `This agent requires the \`${prerequisite.cli}\` CLI to be installed and available on your PATH.${install} try again.`;
  }
  if (message.includes("stream was destroyed")) {
    return "The ACP adapter started, but its wrapped agent stopped while creating a session. Verify that the required CLI is installed and available on PATH, then retry.";
  }
  if (message.includes("ACP connection closed")) {
    return "The ACP adapter or a tool it wraps stopped while creating a session. Verify the workspace and any required CLI dependencies, then retry.";
  }
  return message;
}
function getConnectionState(
  canRun: boolean,
  probing: boolean,
  diagnostics: AcpAgentDiagnostics | null,
  probeError: string | null,
): ConnectionState {
  if (!canRun) return "off";
  if (probing) return "checking";
  if (probeError || (diagnostics?.lastError && !diagnostics.authRequired)) return "error";
  if (diagnostics?.authRequired) return "auth";
  if (diagnostics?.ready) return "ready";
  return "unchecked";
}
const CONNECTION_COPY: Record<
  ConnectionState,
  {
    label: string;
    description: string;
  }
> = {
  off: {
    label: "Installed, off",
    description: "Enable this agent to make it available in Argos.",
  },
  unchecked: {
    label: "Not verified yet",
    description: "Check the connection to verify the command, authentication, and capabilities.",
  },
  checking: {
    label: "Checking connection",
    description: "Starting the agent and negotiating an ACP connection.",
  },
  ready: {
    label: "Ready",
    description: "The latest connection check completed successfully.",
  },
  auth: {
    label: "Authentication needed",
    description: "The agent started, but it needs credentials before it can be used.",
  },
  error: {
    label: "Needs attention",
    description: "The latest connection check failed. Review the message below and try again.",
  },
};
function humanizeAuthMethodId(id: string): string {
  const words = id.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!words) return "Authentication";
  return words
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bOauth\b/g, "OAuth")
    .replace(/\bSso\b/g, "SSO")
    .replace(/\bGithub\b/g, "GitHub");
}
function getAuthMethodOptions(methods: AuthMethod[]): Array<{
  method: AuthMethod;
  label: string;
}> {
  const uniqueMethods = [...new Map(methods.map((method) => [method.id, method])).values()];
  const baseLabels = uniqueMethods.map((method) => method.name?.trim() || humanizeAuthMethodId(method.id));
  const labelCounts = new Map<string, number>();
  baseLabels.forEach((label) => labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1));
  return uniqueMethods.map((method, index) => {
    const baseLabel = baseLabels[index];
    return {
      method,
      label: (labelCounts.get(baseLabel) ?? 0) > 1 ? `${baseLabel} (${humanizeAuthMethodId(method.id)})` : baseLabel,
    };
  });
}
export default function AcpDiagnostics({
  agentId,
  agentName,
  launchSource,
  workdir,
  canRun = true,
  autoCheckRequest = 0,
  onAutoCheckHandled,
}: AcpDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<AcpAgentDiagnostics | null>(null);
  const [remoteSessions, setRemoteSessions] = useState<AcpRemoteSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [workdirInput, setWorkdirInput] = useState(workdir ?? "");
  const [probeError, setProbeError] = useState<string | null>(null);
  const [manualDetailsOpen, setManualDetailsOpen] = useState(false);
  const handledAutoCheckRequest = useRef(0);
  const selectedWorkdir = workdirInput.trim() || undefined;

  // Request sequence so a stale diagnostics response can never overwrite the
  // state owned by a newer refresh (agent/workdir changed mid-flight).
  const diagnosticsRequestSeqRef = useRef(0);
  // Liveness flag flipped by the auto-check effects; post-await state writes are
  // skipped once the effects are torn down so unmounted probes never write state.
  const probeLiveRef = useRef(false);
  const refreshDiagnostics = async () => {
    const requestSeq = ++diagnosticsRequestSeqRef.current;
    try {
      const next = await providerClient.getAcpAgentDiagnostics(agentId, selectedWorkdir ?? null);
      if (requestSeq !== diagnosticsRequestSeqRef.current) return next;
      if (!probeLiveRef.current) return next;
      setDiagnostics(next);
      return next;
    } catch {
      if (!probeLiveRef.current) return null;
      if (requestSeq === diagnosticsRequestSeqRef.current) setDiagnostics(null);
      return null;
    }
  };
  useEffect(() => {
    let cancelled = false;
    void providerClient
      .getAcpAgentDiagnostics(agentId, workdir ?? null)
      .then((next) => {
        if (!cancelled) setDiagnostics(next);
      })
      .catch(() => {
        if (!cancelled) setDiagnostics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, workdir]);
  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const result = await providerClient.runAcpDebugAction({
        agentId,
        action: action as never,
        payload,
        workdir: selectedWorkdir,
      });
      if (result?.status === "error" && result.error) {
        toast({
          title: result.error,
          variant: "destructive",
        });
      } else if (action === "sessionList") {
        setRemoteSessions(extractRemoteSessions(result));
      }
      void refreshDiagnostics();
      setLoading(false);
      return result;
    } catch (error) {
      toast({
        title: "Request failed",
        description: String(error),
        variant: "destructive",
      });
      setLoading(false);
      return null;
    }
  };
  const runDiagnostics = async () => {
    if (!canRun) return;
    setProbing(true);
    setProbeError(null);
    try {
      const result = await withTimeout(
        providerClient.runAcpDebugAction({
          agentId,
          action: "healthCheck",
          workdir: selectedWorkdir,
        }),
        DIAGNOSTICS_TIMEOUT_MS,
      );
      if (!probeLiveRef.current) return;
      if (result.status === "error") {
        setProbeError(
          getProbeErrorMessage(new Error(result.error || "The ACP agent could not be initialized"), agentId),
        );
      } else {
        await refreshDiagnostics();
      }
    } catch (error) {
      if (!probeLiveRef.current) return;
      setProbeError(getProbeErrorMessage(error, agentId));
    }
    if (!probeLiveRef.current) return;
    setProbing(false);
  };
  useEffect(() => {
    probeLiveRef.current = true;
    if (!canRun || autoCheckRequest <= handledAutoCheckRequest.current) return;
    handledAutoCheckRequest.current = autoCheckRequest;
    onAutoCheckHandled?.(autoCheckRequest);
    void runDiagnostics();
    return () => {
      probeLiveRef.current = false;
    };
  }, [autoCheckRequest, canRun, onAutoCheckHandled, runDiagnostics, handledAutoCheckRequest]);

  // Auto-run one health check on mount for enabled agents so they don't sit at
  // "Not verified yet" until the user manually checks.
  const ranMountCheckRef = useRef(false);
  useEffect(() => {
    probeLiveRef.current = true;
    if (!canRun || ranMountCheckRef.current) return;
    ranMountCheckRef.current = true;
    void runDiagnostics();
    return () => {
      probeLiveRef.current = false;
    };
  }, [canRun, runDiagnostics]);
  const caps = diagnostics?.capabilities;
  const connectionState = getConnectionState(canRun, probing, diagnostics, probeError);
  const connectionCopy = CONNECTION_COPY[connectionState];
  const connectionBadgeVariant =
    connectionState === "error" ? "destructive" : connectionState === "ready" ? "default" : "secondary";
  const authMethodOptions = getAuthMethodOptions(diagnostics?.authMethods ?? []);
  const detailsOpen = manualDetailsOpen || Boolean(probeError || diagnostics?.authRequired || diagnostics?.lastError);
  const detailsLabel = detailsOpen ? `Hide ${agentName} connection details` : `Show ${agentName} connection details`;
  const checkLabel = !canRun
    ? `Check ${agentName} connection`
    : probing
      ? `Checking ${agentName} connection`
      : diagnostics?.ready
        ? `Check ${agentName} connection again`
        : `Check ${agentName} connection`;
  return (
    <Collapsible open={detailsOpen} onOpenChange={setManualDetailsOpen}>
      <section aria-label={`${agentName} connection`} className="border-t bg-muted/20 text-xs">
        <ConnectionHeader
          agentId={agentId}
          agentName={agentName}
          connectionState={connectionState}
          connectionCopy={connectionCopy}
          connectionBadgeVariant={connectionBadgeVariant}
          checkLabel={checkLabel}
          detailsLabel={detailsLabel}
          detailsOpen={detailsOpen}
          probing={probing}
          canRun={canRun}
          onCheck={() => void runDiagnostics()}
          onToggleDetails={() => setManualDetailsOpen(!detailsOpen)}
        />

        <CollapsibleContent id={`acp-details-${agentId}`}>
          <div className="flex flex-col gap-3 border-t px-3 py-3">
            <WorkspaceField
              agentId={agentId}
              value={workdirInput}
              disabled={probing || !canRun}
              onChange={(event) => setWorkdirInput(event.target.value)}
            />

            {probeError && <ProbeErrorAlert message={probeError} />}

            {(diagnostics?.ready || diagnostics?.authRequired || diagnostics?.lastError) && (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Row label="Protocol">{diagnostics.protocolVersion ?? "Unavailable"}</Row>
                  <Row label="Agent">{diagnostics.agentName ?? agentName}</Row>
                  <Row label="Version">{diagnostics.agentVersion ?? "Unavailable"}</Row>
                  <Row label="Launch Source">{diagnostics.launchSource ?? launchSource ?? "Unknown"}</Row>
                  <Row label="Workdir">{diagnostics.workdir ?? "App default"}</Row>
                </div>

                <CapabilitiesBadges caps={caps} />

                <AuthMethodsSection
                  options={authMethodOptions}
                  loading={loading}
                  logoutEnabled={Boolean(caps?.authLogout)}
                  onRunAction={runAction}
                />

                {caps?.sessionList && (
                  <RemoteSessionsSection
                    sessions={remoteSessions}
                    loading={loading}
                    canImport={Boolean(caps.loadSession)}
                    canClose={Boolean(caps.sessionClose)}
                    onRunAction={runAction}
                  />
                )}

                {diagnostics.authRequired && (
                  <div className="rounded-lg border bg-background px-2 py-1.5 text-foreground">
                    <span className="font-semibold">Authentication required.</span>{" "}
                    {diagnostics.authRequiredMessage ??
                      "Run an authenticate action or set the required credentials, then retry."}
                  </div>
                )}

                {diagnostics.lastError && !diagnostics.authRequired && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-destructive">
                    {diagnostics.lastError}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
const ConnectionHeader = ({
  agentId,
  agentName,
  connectionState,
  connectionCopy,
  connectionBadgeVariant,
  checkLabel,
  detailsLabel,
  detailsOpen,
  probing,
  canRun,
  onCheck,
  onToggleDetails,
}: {
  agentId: string;
  agentName: string;
  connectionState: ConnectionState;
  connectionCopy: { label: string; description: string };
  connectionBadgeVariant: "destructive" | "default" | "secondary";
  checkLabel: string;
  detailsLabel: string;
  detailsOpen: boolean;
  probing: boolean;
  canRun: boolean;
  onCheck: () => void;
  onToggleDetails: () => void;
}) => (
  <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        connectionState === "ready"
          ? "bg-primary"
          : connectionState === "error"
            ? "bg-destructive"
            : "bg-muted-foreground/60",
      )}
    />
    <Badge variant={connectionBadgeVariant} className="shrink-0">
      {connectionCopy.label}
    </Badge>
    <p className="min-w-0 flex-1 truncate text-muted-foreground">{connectionCopy.description}</p>

    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={checkLabel}
              disabled={probing || !canRun}
              onClick={onCheck}
            >
              {probing ? <Spinner /> : <Icon icon="lucide:refresh-cw" />}
            </Button>
          }
        />
        <TooltipContent>{canRun ? checkLabel : `Enable ${agentName} before checking`}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={detailsLabel}
              aria-expanded={detailsOpen}
              aria-controls={`acp-details-${agentId}`}
              onClick={onToggleDetails}
            >
              <Icon icon={detailsOpen ? "lucide:chevron-up" : "lucide:chevron-down"} />
            </Button>
          }
        />
        <TooltipContent>{detailsLabel}</TooltipContent>
      </Tooltip>
    </div>
  </div>
);
const WorkspaceField = ({
  agentId,
  value,
  disabled,
  onChange,
}: {
  agentId: string;
  value: string;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <Field>
    <FieldLabel htmlFor={`acp-workdir-${agentId}`}>Workspace folder (optional)</FieldLabel>
    <Input
      id={`acp-workdir-${agentId}`}
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder="C:\\Users\\you\\project"
      className="font-mono text-xs"
    />
    <FieldDescription>
      Leave blank to use the app default. Use a project folder when the agent needs context.
    </FieldDescription>
  </Field>
);
const ProbeErrorAlert = ({ message }: { message: string }) => (
  <div
    className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-destructive"
    role="alert"
  >
    <Icon icon="lucide:triangle-alert" className="mt-0.5 size-4 shrink-0" />
    <div className="min-w-0">
      <div className="font-semibold">Connection check failed</div>
      <p className="mt-0.5 text-pretty">{message}</p>
    </div>
  </div>
);
const CapabilitiesBadges = ({ caps }: { caps: DiagnosticsCapabilities | undefined }) => (
  <div>
    <div className="text-xs font-semibold text-muted-foreground mb-1">Capabilities</div>
    <div className="flex flex-wrap gap-1.5">
      {CAPABILITY_LABELS.map(({ key, label }) => {
        const enabled = Boolean(caps?.[key]);
        return (
          <Badge key={key} variant={enabled ? "default" : "outline"} className={enabled ? "" : "opacity-50"}>
            {label}
          </Badge>
        );
      })}
    </div>
  </div>
);
const AuthMethodsSection = ({
  options,
  loading,
  logoutEnabled,
  onRunAction,
}: {
  options: Array<{ method: AuthMethod; label: string }>;
  loading: boolean;
  logoutEnabled: boolean;
  onRunAction: RunDebugAction;
}) => (
  <div>
    <div className="text-xs font-semibold text-muted-foreground mb-1">Authentication</div>
    {options.length ? (
      <div className="flex flex-wrap gap-2">
        {options.map(({ method, label }) => (
          <div key={method.id} className="flex w-full flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={loading}
                onClick={() =>
                  void onRunAction("authenticate", {
                    methodId: method.id,
                  })
                }
              >
                {label}
              </Button>
              {method.type === "env_var" && method.link && (
                <a
                  href={method.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Get credentials
                </a>
              )}
            </div>
            {method.type === "env_var" && method.vars?.length ? (
              <ul className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                {method.vars.map((variable) => (
                  <li key={variable.name} className="flex items-center gap-2">
                    <code className="rounded bg-background px-1 py-0.5 font-mono">{variable.name}</code>
                    {variable.label ? <span className="text-muted-foreground">{variable.label}</span> : null}
                    {variable.optional ? (
                      <Badge variant="outline" className="opacity-70">
                        optional
                      </Badge>
                    ) : (
                      <Badge variant="secondary">required</Badge>
                    )}
                    {variable.secret ? <span className="text-muted-foreground">secret</span> : null}
                  </li>
                ))}
                <li className="pt-0.5 text-muted-foreground">
                  Set these environment variables, then re-initialize the agent from the ACP providers settings.
                </li>
              </ul>
            ) : null}
          </div>
        ))}
        {logoutEnabled && (
          <Button size="xs" variant="ghost" disabled={loading} onClick={() => void onRunAction("logout")}>
            Logout
          </Button>
        )}
      </div>
    ) : (
      <span className="text-muted-foreground">No auth required</span>
    )}
  </div>
);
const RemoteSessionsSection = ({
  sessions,
  loading,
  canImport,
  canClose,
  onRunAction,
}: {
  sessions: AcpRemoteSessionSummary[];
  loading: boolean;
  canImport: boolean;
  canClose: boolean;
  onRunAction: RunDebugAction;
}) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <div className="text-xs font-semibold text-muted-foreground">Remote Sessions</div>
      <Button
        size="xs"
        variant="outline"
        disabled={loading}
        onClick={() =>
          void onRunAction("sessionList", {
            sync: true,
          })
        }
      >
        Sync Sessions
      </Button>
    </div>
    {sessions.length === 0 ? (
      <span className="text-muted-foreground">No remote sessions synced</span>
    ) : (
      <div className="flex flex-col gap-1.5">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{session.title ?? session.sessionId}</div>
              <div className="truncate text-xs text-muted-foreground">{session.sessionId}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {canImport && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={loading}
                  onClick={() =>
                    void onRunAction("sessionImport", {
                      sessionId: session.sessionId,
                    })
                  }
                >
                  Import
                </Button>
              )}
              {canClose && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-destructive"
                  disabled={loading}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Close remote session? This permanently closes the remote ACP session and the agent will no longer be able to resume it.",
                      )
                    ) {
                      void onRunAction("sessionCloseRemote", {
                        sessionId: session.sessionId,
                      });
                    }
                  }}
                >
                  Close Remote
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-semibold text-muted-foreground">{label}:</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
