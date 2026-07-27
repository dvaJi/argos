import { useCallback, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "#api/DeviceClient";
import { Alert, AlertDescription, AlertTitle } from "#shadcn/components/ui/alert";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Separator } from "#shadcn/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
import { useToast } from "#/components/use-toast";
import { getRemoteMachineCommands } from "@argos/shared/remoteMachineCommands";

function getPlatformCommands() {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
  return getRemoteMachineCommands(
    userAgent.includes("win") ? "windows" : userAgent.includes("mac") ? "macos" : "linux",
  );
}

type WorkspaceDraft = {
  name: string;
  remoteUrl: string;
  daemonVersion?: string;
  credentialRef?: string;
  sessionId?: string;
  environmentId?: string;
};

type RemoteWorkspaceSetupProps = {
  existingRemoteUrls?: string[];
  initialRemoteUrl?: string;
  onAddWorkspace: (workspace: WorkspaceDraft) => void | Promise<void>;
  onSaveAndSwitch?: (workspace: WorkspaceDraft) => void | Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
};

type ConnectionState =
  | { kind: "idle" }
  | { kind: "checking"; stage: "reaching" | "pairing" | "verifying" | "saving" }
  | { kind: "review" }
  | { kind: "success"; version?: string }
  | { kind: "error"; code?: string; message: string };

type SetupView = "form" | "instructions";

const deviceClient = createDeviceClient();
const REMOTE_MACHINE_GUIDE_URL = "https://github.com/dvaJi/argos/blob/master/docs/guides/remote-machines.md";

function recoveryForPairingError(code?: string): string | null {
  switch (code) {
    case "pairing_expired":
    case "pairing_consumed":
      return "Generate a new pairing link on the server, then paste it here.";
    case "endpoint_unreachable":
      return "Check that Argos Server is running and that this computer can reach its address.";
    case "endpoint_loopback_remote":
      return "Use the server's private-network or HTTPS address instead of localhost.";
    case "tls_untrusted":
      return "Fix the server certificate or use its trusted private-network address. Argos will not bypass TLS errors.";
    case "secure_storage_unavailable":
      return "Unlock or enable your operating-system secure credential store, then try again.";
    case "protocol_incompatible":
      return "Update Argos Desktop or Argos Server so their supported protocol versions overlap.";
    case "authenticated_rpc_failed":
      return "Pair again. If this persists, verify the server is healthy and copy diagnostics from Machines.";
    default:
      return null;
  }
}

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function deriveName(name: string, remoteUrl: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  try {
    return new URL(remoteUrl).hostname || "Remote";
  } catch {
    return "Remote";
  }
}

function getValidationError(remoteUrl: string, existingRemoteUrls: string[]): string | null {
  const normalized = normalizeServerUrl(remoteUrl);
  if (!normalized) return "Enter the daemon URL before connecting.";

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return "Use a full URL such as http://192.168.1.100:9527.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Use http:// or https:// for the daemon URL.";
  }

  if (existingRemoteUrls.map(normalizeServerUrl).includes(normalized)) {
    return "This daemon is already saved as a workspace.";
  }

  return null;
}

export function RemoteWorkspaceSetup({
  existingRemoteUrls = [],
  initialRemoteUrl = "",
  onAddWorkspace,
  onSaveAndSwitch,
  onCancel,
}: RemoteWorkspaceSetupProps) {
  const { toast } = useToast();
  const [view, setView] = useState<SetupView>("form");
  const [name, setName] = useState("");
  const [pairingUrl, setPairingUrl] = useState("");
  const [remoteUrl, setRemoteUrl] = useState(initialRemoteUrl);
  const [advanced, setAdvanced] = useState(Boolean(initialRemoteUrl));
  const [connection, setConnection] = useState<ConnectionState>({ kind: "idle" });
  const [pendingWorkspace, setPendingWorkspace] = useState<WorkspaceDraft | null>(null);

  const validationError = useMemo(
    () => getValidationError(remoteUrl, existingRemoteUrls),
    [remoteUrl, existingRemoteUrls],
  );
  const normalizedUrl = normalizeServerUrl(remoteUrl);
  const canConnect = connection.kind !== "checking" && (pairingUrl.trim().length > 0 || (advanced && !validationError));

  const copyCommand = useCallback(
    (command: string) => {
      deviceClient.copyText(command);
      toast({ title: "Copied command", duration: 1600 });
    },
    [toast],
  );

  const resetFields = useCallback(() => {
    setName("");
    setPairingUrl("");
    setRemoteUrl("");
    setAdvanced(false);
    setPendingWorkspace(null);
  }, []);

  const handleConnect = useCallback(async () => {
    const trimmedPairingUrl = pairingUrl.trim();
    if (!trimmedPairingUrl && !advanced) {
      setConnection({ kind: "error", message: "Paste the pairing link printed by Argos Server." });
      return;
    }

    if (trimmedPairingUrl) {
      setConnection({ kind: "checking", stage: "pairing" });
      let issuedCredentialRef: string | undefined;
      try {
        const result = await window.argos?.workspace?.pairRemote?.(trimmedPairingUrl);
        if (!result?.ok || !result.remoteUrl || !result.credentialRef) {
          setConnection({
            kind: "error",
            code: result?.error?.code,
            message: result?.error?.message ?? "Pairing failed.",
          });
          return;
        }
        issuedCredentialRef = result.credentialRef;
        setConnection({ kind: "checking", stage: "verifying" });
        const response = await fetch(`${result.remoteUrl}/health`);
        if (!response.ok) {
          await window.argos?.workspace?.discardCredential?.(issuedCredentialRef);
          setConnection({ kind: "error", message: "The paired server did not report a healthy status." });
          return;
        }
        const body = (await response.json()) as { status?: string; version?: string; environmentId?: string };
        if (body.status !== "ok") {
          await window.argos?.workspace?.discardCredential?.(issuedCredentialRef);
          setConnection({ kind: "error", message: "The paired server did not report a healthy status." });
          return;
        }
        setPendingWorkspace({
          name: deriveName(name, result.remoteUrl),
          remoteUrl: result.remoteUrl,
          daemonVersion: result.serverVersion ?? body.version,
          credentialRef: result.credentialRef,
          sessionId: result.sessionId,
          environmentId: result.environmentId ?? body.environmentId,
        });
        setConnection({ kind: "review" });
      } catch (error) {
        if (issuedCredentialRef) {
          await window.argos?.workspace?.discardCredential?.(issuedCredentialRef);
        }
        setConnection({ kind: "error", message: error instanceof Error ? error.message : "Pairing failed." });
      }
      return;
    }

    const error = getValidationError(remoteUrl, existingRemoteUrls);
    if (error) {
      setConnection({ kind: "error", message: error });
      return;
    }

    setConnection({ kind: "checking", stage: "reaching" });

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${normalizedUrl}/health`, { signal: controller.signal });
      window.clearTimeout(timeout);

      if (!response.ok) {
        setConnection({ kind: "error", message: `Health check failed with HTTP ${response.status}.` });
        return;
      }

      const body = (await response.json()) as { status?: string; version?: string };
      if (body.status !== "ok") {
        setConnection({ kind: "error", message: "The daemon responded, but it did not report a healthy status." });
        return;
      }

      setPendingWorkspace({
        name: deriveName(name, normalizedUrl),
        remoteUrl: normalizedUrl,
        daemonVersion: body.version,
      });
      setConnection({ kind: "review" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnection({ kind: "error", message });
    }
  }, [advanced, existingRemoteUrls, name, normalizedUrl, pairingUrl, remoteUrl]);

  const handleSave = useCallback(
    async (andSwitch: boolean) => {
      if (!pendingWorkspace) return;
      setConnection({ kind: "checking", stage: "saving" });
      try {
        if (andSwitch && onSaveAndSwitch) {
          await onSaveAndSwitch(pendingWorkspace);
        } else {
          await onAddWorkspace(pendingWorkspace);
        }
        setConnection({ kind: "success", version: pendingWorkspace.daemonVersion });
        toast({
          title: pendingWorkspace.daemonVersion
            ? `Saved Argos Server v${pendingWorkspace.daemonVersion}`
            : "Remote machine saved",
        });
        resetFields();
      } catch (error) {
        setConnection({
          kind: "error",
          message: error instanceof Error ? error.message : "Saving the machine failed.",
        });
      }
    },
    [onAddWorkspace, onSaveAndSwitch, pendingWorkspace, resetFields, toast],
  );

  const discardPendingCredential = useCallback(async () => {
    if (pendingWorkspace?.credentialRef) {
      await window.argos?.workspace?.discardCredential?.(pendingWorkspace.credentialRef);
    }
  }, [pendingWorkspace]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1 pr-8">
        <h3 className="text-balance text-base font-semibold text-foreground">Connect a remote machine</h3>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          This computer is managed automatically by Argos Desktop. Use Argos Server on another machine when you want
          agents and project files to stay there.
        </p>
      </div>

      <Tabs value={view} onValueChange={(value) => setView(value as SetupView)} className="gap-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="form" className="gap-1.5">
            <Icon icon="lucide:square-pen" className="size-3.5" />
            Form
          </TabsTrigger>
          <TabsTrigger value="instructions" className="gap-1.5">
            <Icon icon="lucide:book-open" className="size-3.5" />
            Instructions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-0">
          {pendingWorkspace && connection.kind === "review" ? (
            <ReviewPanel
              workspace={pendingWorkspace}
              canSwitch={Boolean(onSaveAndSwitch)}
              onBack={() => {
                void discardPendingCredential();
                setPendingWorkspace(null);
                setConnection({ kind: "idle" });
              }}
              onSave={() => void handleSave(false)}
              onSaveAndSwitch={() => void handleSave(true)}
            />
          ) : (
            <ConnectionForm
              name={name}
              pairingUrl={pairingUrl}
              remoteUrl={remoteUrl}
              advanced={advanced}
              validationError={validationError}
              connection={connection}
              canConnect={canConnect}
              onNameChange={setName}
              onPairingUrlChange={(value) => {
                setPairingUrl(value);
                setConnection({ kind: "idle" });
              }}
              onAdvancedChange={setAdvanced}
              onUrlChange={(value) => {
                setRemoteUrl(value);
                setConnection({ kind: "idle" });
              }}
              onCancel={() => {
                void discardPendingCredential();
                onCancel?.();
              }}
              onConnect={handleConnect}
              onShowInstructions={() => setView("instructions")}
            />
          )}
        </TabsContent>

        <TabsContent value="instructions" className="mt-0">
          <InstructionsPanel onCopyCommand={copyCommand} onShowForm={() => setView("form")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionForm({
  name,
  pairingUrl,
  remoteUrl,
  advanced,
  validationError,
  connection,
  canConnect,
  onNameChange,
  onPairingUrlChange,
  onAdvancedChange,
  onUrlChange,
  onCancel,
  onConnect,
  onShowInstructions,
}: {
  name: string;
  pairingUrl: string;
  remoteUrl: string;
  advanced: boolean;
  validationError: string | null;
  connection: ConnectionState;
  canConnect: boolean;
  onNameChange: (value: string) => void;
  onPairingUrlChange: (value: string) => void;
  onAdvancedChange: (value: boolean) => void;
  onUrlChange: (value: string) => void;
  onCancel?: () => void;
  onConnect: () => void;
  onShowInstructions: () => void;
}) {
  const recovery = connection.kind === "error" ? recoveryForPairingError(connection.code) : null;
  return (
    <section className="rounded-2xl border bg-background p-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="remote-machine-pairing-url">Pairing link</Label>
          <Input
            id="remote-machine-pairing-url"
            placeholder="Paste the link printed by argos-daemon --pair"
            value={pairingUrl}
            onChange={(event) => onPairingUrlChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Pairing creates a revocable connection. You do not need to copy a bearer token.
          </p>
        </div>

        <button
          type="button"
          className="text-left text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => onAdvancedChange(!advanced)}
        >
          {advanced ? "Hide advanced URL connection" : "Advanced: connect by server URL"}
        </button>

        <div className="space-y-2">
          <Label htmlFor="remote-workspace-name">Machine name</Label>
          <Input
            id="remote-workspace-name"
            placeholder="Build server"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Optional. If empty, Argos uses the server host name.</p>
        </div>

        {advanced && (
          <div className="space-y-2">
            <Label htmlFor="remote-workspace-url">Daemon URL</Label>
            <Input
              id="remote-workspace-url"
              placeholder="http://192.168.1.100:9527"
              value={remoteUrl}
              onChange={(event) => onUrlChange(event.target.value)}
              aria-invalid={Boolean(validationError && remoteUrl.trim())}
            />
            {validationError && remoteUrl.trim() ? (
              <p className="text-xs text-destructive">{validationError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Use the daemon HTTP address, not the WebSocket URL.</p>
            )}
          </div>
        )}

        {connection.kind === "error" && (
          <Alert variant="destructive" role="alert">
            <Icon icon="lucide:circle-alert" className="size-4" />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>
              <p>{connection.message}</p>
              {recovery && <p className="mt-2">{recovery}</p>}
            </AlertDescription>
          </Alert>
        )}

        {connection.kind === "success" && (
          <Alert role="status" aria-live="polite">
            <Icon icon="lucide:circle-check" className="size-4" />
            <AlertTitle>Workspace added</AlertTitle>
            <AlertDescription>
              {connection.version ? `Daemon v${connection.version} is ready.` : "The daemon is ready."}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={onShowInstructions}>
            Need install instructions?
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={() => onConnect()} disabled={!canConnect}>
              {connection.kind === "checking"
                ? {
                    reaching: "Checking server...",
                    pairing: "Pairing...",
                    verifying: "Verifying machine...",
                    saving: "Saving machine...",
                  }[connection.stage]
                : "Pair and add"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewPanel({
  workspace,
  canSwitch,
  onBack,
  onSave,
  onSaveAndSwitch,
}: {
  workspace: WorkspaceDraft;
  canSwitch: boolean;
  onBack: () => void;
  onSave: () => void;
  onSaveAndSwitch: () => void;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground">Review remote machine</h4>
        <p className="text-sm text-muted-foreground">
          Pairing is verified. Work, project files, and agent processes remain on this machine.
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Machine</dt>
          <dd className="font-medium">{workspace.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Server version</dt>
          <dd className="font-medium">{workspace.daemonVersion ?? "Unknown"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Endpoint</dt>
          <dd className="break-all font-mono text-xs">{workspace.remoteUrl}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Environment identity</dt>
          <dd className="break-all font-mono text-xs">{workspace.environmentId ?? "Not available"}</dd>
        </div>
      </dl>
      <Alert>
        <Icon icon="lucide:shield-check" className="size-4" />
        <AlertTitle>Secure pairing</AlertTitle>
        <AlertDescription>
          Argos stores the revocable session credential in the operating system secure store; the pairing link is not
          retained.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button variant="secondary" onClick={onSave}>
          Save machine
        </Button>
        {canSwitch && <Button onClick={onSaveAndSwitch}>Save and switch</Button>}
      </div>
    </section>
  );
}

function InstructionsPanel({
  onCopyCommand,
  onShowForm,
}: {
  onCopyCommand: (command: string) => void;
  onShowForm: () => void;
}) {
  const commands = getPlatformCommands();
  const [showPrivateNetworkCommand, setShowPrivateNetworkCommand] = useState(false);
  return (
    <section className="rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Basic daemon instructions</h3>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          Install the daemon on the machine you want to use as a remote workspace, start it, then return to the form.
        </p>
      </div>

      <Separator className="my-4" />

      <div className="space-y-4">
        {!commands.available && (
          <Alert>
            <Icon icon="lucide:info" className="size-4" />
            <AlertTitle>Argos Server is not available for this platform</AlertTitle>
            <AlertDescription>{commands.unavailableReason}</AlertDescription>
          </Alert>
        )}
        <InstructionGroup title="Install daemon" description="Pick the command that matches the remote host.">
          {commands.available && (
            <CommandRow label="Install" detail={commands.platform} command={commands.install} onCopy={onCopyCommand} />
          )}
        </InstructionGroup>

        {commands.available && (
          <InstructionGroup title="Run and verify" description="Start the daemon and check that it is healthy.">
            <CommandRow label="Start (local)" command={commands.start.loopback} onCopy={onCopyCommand} />
            <CommandRow label="Health check" command={commands.health} onCopy={onCopyCommand} />
            <CommandRow label="Version" command={commands.version} onCopy={onCopyCommand} />
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-muted-foreground">
                A LAN or private-overlay server is reachable by other devices. Restrict its firewall to trusted clients.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setShowPrivateNetworkCommand((current) => !current)}
              >
                {showPrivateNetworkCommand ? "Hide network command" : "I understand — show network command"}
              </Button>
              {showPrivateNetworkCommand && (
                <div className="mt-2">
                  <CommandRow
                    label="Start (network)"
                    command={commands.start["private-network"]}
                    onCopy={onCopyCommand}
                  />
                </div>
              )}
            </div>
          </InstructionGroup>
        )}

        <Alert>
          <Icon icon="lucide:shield-check" className="size-4" />
          <AlertTitle>Pairing is the recommended connection</AlertTitle>
          <AlertDescription>
            Start Argos Server with its pairing option on the remote machine, then paste the short-lived link above. For
            internet-distance access, use a private overlay network or HTTPS reverse proxy.
          </AlertDescription>
        </Alert>

        <a
          href={REMOTE_MACHINE_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open the remote-machine guide
        </a>

        <div className="flex justify-end">
          <Button type="button" onClick={onShowForm}>
            Back to form
          </Button>
        </div>
      </div>
    </section>
  );
}

function InstructionGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CommandRow({
  label,
  detail,
  command,
  onCopy,
}: {
  label: string;
  detail?: string;
  command: string;
  onCopy: (command: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-xl border bg-muted/20 px-3 py-2 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
      <code className="min-w-0 overflow-x-auto whitespace-nowrap rounded-md bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {command}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onCopy(command)}
        aria-label={`Copy ${label} command`}
      >
        <Icon icon="lucide:copy" className="size-4" />
      </Button>
    </div>
  );
}
