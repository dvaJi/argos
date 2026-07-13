import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#shadcn/components/ui/card";
import type { AcpAgentDiagnostics, AcpRemoteSessionSummary, AcpDebugRunResult } from "@argos/shared/presenter";
import { getLegacyWebContentsId, useLegacyPresenter } from "#api/legacy/presenters";
import { toast } from "#/components/use-toast";

interface AcpDiagnosticsProps {
  agentId: string;
  agentName: string;
  launchSource?: string | null;
  workdir?: string | null;
}

const CAPABILITY_LABELS: Array<{ key: keyof AcpAgentDiagnostics["capabilities"]; label: string }> = [
  { key: "loadSession", label: "Load Session" },
  { key: "sessionList", label: "Session List" },
  { key: "sessionResume", label: "Resume" },
  { key: "sessionClose", label: "Close" },
  { key: "sessionFork", label: "Fork" },
  { key: "authLogout", label: "Logout" },
  { key: "fs", label: "File System" },
  { key: "terminal", label: "Terminal" },
];

const DIAGNOSTICS_TIMEOUT_MS = 20000;

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
    const payload = event.payload as { sessions?: Array<Record<string, unknown>> } | undefined;
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

export default function AcpDiagnostics({ agentId, agentName, launchSource, workdir }: AcpDiagnosticsProps) {
  const llmProviderPresenter = useLegacyPresenter("llmproviderPresenter");
  const [diagnostics, setDiagnostics] = useState<AcpAgentDiagnostics | null>(null);
  const [remoteSessions, setRemoteSessions] = useState<AcpRemoteSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);

  const refreshDiagnostics = useCallback(() => {
    try {
      const next = llmProviderPresenter.getAcpAgentDiagnostics(agentId, workdir ?? null);
      setDiagnostics(next);
    } catch {
      setDiagnostics(null);
    }
  }, [agentId, workdir, llmProviderPresenter]);

  useEffect(() => {
    setRemoteSessions([]);
  }, [agentId, workdir]);

  useEffect(() => {
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  const runAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setLoading(true);
      try {
        const result = await llmProviderPresenter.runAcpDebugAction({
          agentId,
          action: action as never,
          payload,
          webContentsId: getLegacyWebContentsId() || undefined,
        });
        if (result?.status === "error" && result.error) {
          toast({ title: result.error, variant: "destructive" });
        } else if (action === "sessionList") {
          setRemoteSessions(extractRemoteSessions(result));
        }
        refreshDiagnostics();
        return result;
      } catch (error) {
        toast({ title: "Request failed", description: String(error), variant: "destructive" });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, llmProviderPresenter, refreshDiagnostics],
  );

  const runDiagnostics = useCallback(async () => {
    setProbing(true);
    try {
      await withTimeout(
        llmProviderPresenter.runAcpDebugAction({
          agentId,
          action: "initialize",
          webContentsId: getLegacyWebContentsId() || undefined,
        }),
        DIAGNOSTICS_TIMEOUT_MS,
      );
      refreshDiagnostics();
      toast({ title: "Diagnostics complete" });
    } catch (error) {
      toast({ title: "Diagnostics failed", description: String(error), variant: "destructive" });
    } finally {
      setProbing(false);
    }
  }, [agentId, llmProviderPresenter, refreshDiagnostics]);

  const caps = diagnostics?.capabilities;

  return (
    <Card className="mt-3 border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Diagnostics</CardTitle>
            <CardDescription className="text-xs">Agent capability and connection status</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8" disabled={probing} onClick={() => void runDiagnostics()}>
            {probing && <Icon icon="lucide:loader" className="h-4 w-4 mr-2 animate-spin" />}
            {probing ? "Probing..." : "Run Diagnostics"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <Row label="Readiness">
            {diagnostics?.ready ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60" /> Not Ready
              </span>
            )}
          </Row>
          <Row label="Protocol">{diagnostics?.protocolVersion ?? "—"}</Row>
          <Row label="Agent">{diagnostics?.agentName ?? agentName}</Row>
          <Row label="Version">{diagnostics?.agentVersion ?? "—"}</Row>
          <Row label="Launch Source">{diagnostics?.launchSource ?? launchSource ?? "—"}</Row>
          <Row label="Workdir">{diagnostics?.workdir ?? "—"}</Row>
        </div>

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

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Authentication</div>
          {diagnostics?.authMethods?.length ? (
            <div className="flex flex-wrap gap-2">
              {diagnostics.authMethods.map((method) => (
                <div key={method.id} className="w-full space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={loading}
                      onClick={() => void runAction("authenticate", { methodId: method.id })}
                    >
                      Authenticate{method.type ? ` (${method.type})` : ""}
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
                    <ul className="space-y-1 rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">
                      {method.vars.map((variable) => (
                        <li key={variable.name} className="flex items-center gap-2">
                          <code className="rounded bg-background px-1 py-0.5 font-mono">{variable.name}</code>
                          {variable.label ? <span className="text-muted-foreground">{variable.label}</span> : null}
                          {variable.optional ? (
                            <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                              optional
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                              required
                            </Badge>
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
              {caps?.authLogout && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  disabled={loading}
                  onClick={() => void runAction("logout")}
                >
                  Logout
                </Button>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">No auth required</span>
          )}
        </div>

        {caps?.sessionList && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-muted-foreground">Remote Sessions</div>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={loading}
                onClick={() => void runAction("sessionList", { sync: true })}
              >
                Sync Sessions
              </Button>
            </div>
            {remoteSessions.length === 0 ? (
              <span className="text-muted-foreground">No remote sessions synced</span>
            ) : (
              <div className="space-y-1.5">
                {remoteSessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{session.title ?? session.sessionId}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{session.sessionId}</div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {caps.loadSession && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={loading}
                          onClick={() => void runAction("sessionImport", { sessionId: session.sessionId })}
                        >
                          Import
                        </Button>
                      )}
                      {caps.sessionClose && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive"
                          disabled={loading}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Close remote session? This permanently closes the remote ACP session and the agent will no longer be able to resume it.",
                              )
                            ) {
                              void runAction("sessionCloseRemote", { sessionId: session.sessionId });
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
        )}

        {diagnostics?.authRequired && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-400">
            <span className="font-semibold">Authentication required.</span>{" "}
            {diagnostics.authRequiredMessage ??
              "Run an authenticate action or set the required credentials, then retry."}
          </div>
        )}

        {diagnostics?.lastError && !diagnostics.authRequired && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-destructive">
            {diagnostics.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-semibold text-muted-foreground">{label}:</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
