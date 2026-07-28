import { useEffect, useReducer, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "#api/DeviceClient";
import { Alert, AlertDescription, AlertTitle } from "#shadcn/components/ui/alert";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Separator } from "#shadcn/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
import { useToast } from "#/components/use-toast";
import { getRemoteMachineCommands, type RemoteMachinePlatform } from "@argos/shared/remoteMachineCommands";
import type { RemotePairingProgressStage } from "@argos/shared-contracts/bridge";

function getDefaultRemotePlatform(): RemoteMachinePlatform {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
  return userAgent.includes("win") ? "windows" : userAgent.includes("mac") ? "macos" : "linux";
}

type WorkspaceDraft = {
  name: string;
  remoteUrl: string;
  daemonVersion?: string;
  credentialRef?: string;
  sessionId?: string;
  environmentId?: string;
  protocolVersion?: number;
  runtimeKind?: "daemon";
  capabilities?: string[];
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
  | { kind: "checking"; stage: RemotePairingProgressStage | "saving" }
  | { kind: "review" }
  | { kind: "success"; version?: string }
  | { kind: "error"; code?: string; message: string };

type SetupView = "form" | "instructions";

type SetupFormState = {
  view: SetupView;
  name: string;
  pairingUrl: string;
};

type SetupFormAction =
  | { type: "set-view"; value: SetupView }
  | { type: "set-name"; value: string }
  | { type: "set-pairing-url"; value: string }
  | { type: "reset" };

const deviceClient = createDeviceClient();
const REMOTE_MACHINE_GUIDE_URL = "https://github.com/dvaJi/argos/blob/master/docs/guides/remote-machines.md";

function recoveryForPairingError(code?: string): string | null {
  switch (code) {
    case "pairing_expired":
    case "pairing_consumed":
      return "Generate a new pairing link on the server, then paste it here.";
    case "pairing_invalid":
      return "Paste the complete pairing link printed by Argos Server, or generate a fresh one.";
    case "endpoint_unreachable":
      return "Check that Argos Server is running and that this computer can reach its address.";
    case "endpoint_loopback_remote":
      return "Use the server's private-network or HTTPS address instead of localhost.";
    case "tls_untrusted":
      return "Fix the server certificate or use its trusted private-network address. Argos will not bypass TLS errors.";
    case "secure_storage_unavailable":
      return "Unlock or enable your operating-system secure credential store, then try again.";
    case "session_revoked":
      return "This machine revoked this desktop session. Generate a new pairing link and pair again.";
    case "protocol_incompatible":
      return "Update Argos Desktop or Argos Server so their supported protocol versions overlap.";
    case "environment_identity_changed":
      return "The server at this address is a different machine. Verify its identity before replacing the saved machine.";
    case "authenticated_rpc_failed":
      return "Pair again. If this persists, verify the server is healthy and copy diagnostics from Machines.";
    case "event_readiness_failed":
      return "The server did not confirm its event connection. Check server health, then try pairing again.";
    case "capability_missing":
      return "This server does not provide a capability required by Argos Desktop. Update or reconfigure the server.";
    default:
      return null;
  }
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

function setupFormReducer(state: SetupFormState, action: SetupFormAction): SetupFormState {
  switch (action.type) {
    case "set-view":
      return { ...state, view: action.value };
    case "set-name":
      return { ...state, name: action.value };
    case "set-pairing-url":
      return { ...state, pairingUrl: action.value };
    case "reset":
      return { ...state, name: "", pairingUrl: "" };
  }
}

export function RemoteWorkspaceSetup({
  initialRemoteUrl = "",
  onAddWorkspace,
  onSaveAndSwitch,
  onCancel,
}: RemoteWorkspaceSetupProps) {
  const { toast } = useToast();
  const [form, dispatchForm] = useReducer(setupFormReducer, {
    view: "form",
    name: "",
    pairingUrl: "",
  });
  const [connection, setConnection] = useState<ConnectionState>({ kind: "idle" });
  const [pendingWorkspace, setPendingWorkspace] = useState<WorkspaceDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clientVersion, setClientVersion] = useState<string>();

  const { view, name, pairingUrl } = form;
  const canConnect = connection.kind !== "checking" && pairingUrl.trim().length > 0;

  useEffect(() => {
    void deviceClient
      .getAppVersion()
      .then(setClientVersion)
      .catch(() => {});
  }, []);

  const copyCommand = (command: string) => {
    deviceClient.copyText(command);
    toast({ title: "Copied command", duration: 1600 });
  };

  const resetFields = () => {
    dispatchForm({ type: "reset" });
    setPendingWorkspace(null);
  };

  const handleConnect = async () => {
    const trimmedPairingUrl = pairingUrl.trim();
    if (!trimmedPairingUrl) {
      setConnection({ kind: "error", message: "Paste the pairing link or code printed by Argos Server." });
      return;
    }

    setConnection({ kind: "checking", stage: "parsing" });
    let issuedCredentialRef: string | undefined;
    try {
      const result = await window.argos?.workspace?.pairRemote?.(trimmedPairingUrl, (stage) => {
        setConnection({ kind: "checking", stage });
      });
      if (!result?.ok || !result.remoteUrl || !result.credentialRef) {
        setConnection({
          kind: "error",
          code: result?.error?.code,
          message: result?.error?.message ?? "Pairing failed.",
        });
        return;
      }
      issuedCredentialRef = result.credentialRef;
      // pairRemote performs the authenticated WebSocket, environment, capability,
      // and event-readiness checks before returning. Do not turn a public health
      // endpoint into a second save gate: it cannot prove that a paired machine is
      // usable and may be deliberately unavailable behind a reverse proxy.
      setPendingWorkspace({
        name: deriveName(name, result.remoteUrl),
        remoteUrl: result.remoteUrl,
        daemonVersion: result.serverVersion,
        credentialRef: result.credentialRef,
        sessionId: result.sessionId,
        environmentId: result.environmentId,
        protocolVersion: result.protocolVersion,
        runtimeKind: result.runtimeKind,
        capabilities: result.capabilities,
      });
      setConnection({ kind: "review" });
    } catch (error) {
      if (issuedCredentialRef) {
        await window.argos?.workspace?.discardCredential?.(issuedCredentialRef);
      }
      setConnection({ kind: "error", message: error instanceof Error ? error.message : "Pairing failed." });
    }
  };

  const handleSave = async (andSwitch: boolean) => {
    if (!pendingWorkspace) return;
    setSaveError(null);
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
      setSaveError(error instanceof Error ? error.message : "Saving the machine failed.");
      setConnection({ kind: "review" });
    }
  };

  const discardPendingCredential = async () => {
    if (pendingWorkspace?.credentialRef) {
      await window.argos?.workspace?.discardCredential?.(pendingWorkspace.credentialRef);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1 pr-8">
        <h3 className="text-balance text-base font-semibold text-foreground">Connect a remote machine</h3>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          This computer is managed automatically by Argos Desktop. Use Argos Server on another machine when you want
          agents and project files to stay there.
        </p>
      </div>

      <Tabs
        value={view}
        onValueChange={(value) => dispatchForm({ type: "set-view", value: value as SetupView })}
        className="gap-4"
      >
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
              clientVersion={clientVersion}
              canSwitch={Boolean(onSaveAndSwitch)}
              saveError={saveError}
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
              previousEndpoint={initialRemoteUrl}
              connection={connection}
              canConnect={canConnect}
              onNameChange={(value) => dispatchForm({ type: "set-name", value })}
              onPairingUrlChange={(value) => {
                dispatchForm({ type: "set-pairing-url", value });
                setConnection({ kind: "idle" });
              }}
              onCancel={() => {
                void discardPendingCredential();
                onCancel?.();
              }}
              onConnect={handleConnect}
              onShowInstructions={() => dispatchForm({ type: "set-view", value: "instructions" })}
            />
          )}
        </TabsContent>

        <TabsContent value="instructions" className="mt-0">
          <InstructionsPanel
            onCopyCommand={copyCommand}
            onShowForm={() => dispatchForm({ type: "set-view", value: "form" })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionForm({
  name,
  pairingUrl,
  previousEndpoint,
  connection,
  canConnect,
  onNameChange,
  onPairingUrlChange,
  onCancel,
  onConnect,
  onShowInstructions,
}: {
  name: string;
  pairingUrl: string;
  previousEndpoint: string;
  connection: ConnectionState;
  canConnect: boolean;
  onNameChange: (value: string) => void;
  onPairingUrlChange: (value: string) => void;
  onCancel?: () => void;
  onConnect: () => void;
  onShowInstructions: () => void;
}) {
  const recovery = connection.kind === "error" ? recoveryForPairingError(connection.code) : null;
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection.kind === "error") {
      errorRef.current?.focus();
    }
  }, [connection.kind]);

  return (
    <section className="rounded-2xl border bg-background p-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="remote-machine-pairing-url">Pairing link or code</Label>
          <Input
            id="remote-machine-pairing-url"
            placeholder="Paste the link or ARGOS1 code printed by argos-daemon --pair"
            value={pairingUrl}
            onChange={(event) => onPairingUrlChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Pairing creates a revocable connection. You do not need to copy a bearer token.
          </p>
        </div>

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

        {previousEndpoint && (
          <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            Previously saved address: <span className="font-mono">{previousEndpoint}</span>. Pair again with a fresh
            link to verify this machine before saving it.
          </p>
        )}

        {connection.kind === "error" && (
          <Alert ref={errorRef} variant="destructive" role="alert" tabIndex={-1}>
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
            <AlertTitle>Machine added</AlertTitle>
            <AlertDescription>
              {connection.version ? `Daemon v${connection.version} is ready.` : "The daemon is ready."}
            </AlertDescription>
          </Alert>
        )}

        {connection.kind === "checking" && (
          <p className="sr-only" role="status" aria-live="polite">
            {
              {
                parsing: "Checking the pairing entry.",
                reaching: "Checking the server connection.",
                exchanging: "Exchanging the one-time pairing credential.",
                authenticating: "Authenticating with Argos Server.",
                storing: "Storing the session in the secure credential store.",
                connecting: "Opening the authenticated event connection.",
                events: "Confirming event readiness.",
                handshaking: "Reading the verified server identity.",
                capabilities: "Checking required server capabilities.",
                saving: "Saving the remote machine.",
              }[connection.stage]
            }
          </p>
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
                    parsing: "Checking entry...",
                    reaching: "Checking server...",
                    exchanging: "Exchanging...",
                    authenticating: "Authenticating...",
                    storing: "Securing session...",
                    connecting: "Connecting...",
                    events: "Checking events...",
                    handshaking: "Verifying identity...",
                    capabilities: "Checking capabilities...",
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
  clientVersion,
  canSwitch,
  saveError,
  onBack,
  onSave,
  onSaveAndSwitch,
}: {
  workspace: WorkspaceDraft;
  clientVersion?: string;
  canSwitch: boolean;
  saveError: string | null;
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
        <div>
          <dt className="text-xs text-muted-foreground">Protocol</dt>
          <dd className="font-medium">{workspace.protocolVersion ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Runtime</dt>
          <dd className="font-medium">{workspace.runtimeKind === "daemon" ? "Argos Server" : "Unknown"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Endpoint</dt>
          <dd className="break-all font-mono text-xs">{workspace.remoteUrl}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Environment identity</dt>
          <dd className="break-all font-mono text-xs">{workspace.environmentId ?? "Not available"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Connection security</dt>
          <dd className="text-xs">
            {workspace.remoteUrl.startsWith("https://")
              ? "TLS-protected endpoint"
              : "Plain HTTP — use only on an explicitly trusted private network"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Verified capabilities</dt>
          <dd className="text-xs">
            {workspace.capabilities?.length ? workspace.capabilities.join(", ") : "No capabilities reported"}
          </dd>
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
      {saveError && (
        <Alert variant="destructive" role="alert">
          <Icon icon="lucide:triangle-alert" className="size-4" />
          <AlertTitle>Machine was not saved</AlertTitle>
          <AlertDescription>{saveError} You can retry without pairing again.</AlertDescription>
        </Alert>
      )}
      {clientVersion && workspace.daemonVersion && clientVersion !== workspace.daemonVersion && (
        <Alert>
          <Icon icon="lucide:badge-alert" className="size-4" />
          <AlertTitle>Versions differ, but are compatible</AlertTitle>
          <AlertDescription>
            Desktop is v{clientVersion} and Argos Server is v{workspace.daemonVersion}. Their verified protocol is
            compatible; update either side if you encounter a missing capability.
          </AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">
        Desktop-only features such as native windows and operating-system integration remain on this computer.
      </p>
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
  const [platform, setPlatform] = useState<RemoteMachinePlatform>(getDefaultRemotePlatform);
  const commands = getRemoteMachineCommands(platform);
  const [showPrivateNetworkCommand, setShowPrivateNetworkCommand] = useState(false);
  return (
    <section className="rounded-2xl border bg-background p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Basic daemon instructions</h3>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          Install Argos Server on the machine you want to use remotely, start it, then return to the form.
        </p>
      </div>

      <Separator className="my-4" />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="remote-machine-platform">Other machine</Label>
          <select
            id="remote-machine-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as RemoteMachinePlatform)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-64"
          >
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Choose the platform of the machine that will run Argos Server. The installer detects its supported
            architecture automatically.
          </p>
        </div>

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
