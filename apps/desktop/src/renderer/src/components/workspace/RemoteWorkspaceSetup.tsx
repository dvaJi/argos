import { useCallback, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "@api/DeviceClient";
import { Alert, AlertDescription, AlertTitle } from "@shadcn/components/ui/alert";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Separator } from "@shadcn/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shadcn/components/ui/tabs";
import { useToast } from "@/components/use-toast";

const INSTALL_RAW = "https://raw.githubusercontent.com/dvaJi/argos/main/distro/install";

const INSTALL_OPTIONS = [
  {
    label: "Homebrew",
    detail: "macOS or Linux with brew",
    command: "brew install dvaJi/tap/argos-daemon",
  },
  {
    label: "Shell",
    detail: "macOS or Linux without brew",
    command: `curl -fsSL ${INSTALL_RAW}/install.sh | sh`,
  },
  {
    label: "PowerShell",
    detail: "Windows hosts",
    command: `irm ${INSTALL_RAW}/install.ps1 | iex`,
  },
] as const;

const RUN_COMMANDS = [
  {
    label: "Start with a token",
    command: "argos-daemon --with-token",
  },
  {
    label: "Remote host",
    command: "ARGOS_HOST=0.0.0.0 ARGOS_TOKEN=<secret> argos-daemon",
  },
  {
    label: "Health check",
    command: "curl http://127.0.0.1:9527/health",
  },
] as const;

type WorkspaceDraft = {
  name: string;
  remoteUrl: string;
  authToken: string;
  daemonVersion?: string;
};

type RemoteWorkspaceSetupProps = {
  existingRemoteUrls?: string[];
  onAddWorkspace: (workspace: WorkspaceDraft) => void | Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
};

type ConnectionState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "success"; version?: string }
  | { kind: "error"; message: string };

type SetupView = "form" | "instructions";

const deviceClient = createDeviceClient();

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

export function RemoteWorkspaceSetup({ existingRemoteUrls = [], onAddWorkspace, onCancel }: RemoteWorkspaceSetupProps) {
  const { toast } = useToast();
  const [view, setView] = useState<SetupView>("form");
  const [name, setName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [connection, setConnection] = useState<ConnectionState>({ kind: "idle" });

  const validationError = useMemo(
    () => getValidationError(remoteUrl, existingRemoteUrls),
    [remoteUrl, existingRemoteUrls],
  );
  const normalizedUrl = normalizeServerUrl(remoteUrl);
  const canConnect = !validationError && connection.kind !== "checking";

  const copyCommand = useCallback(
    (command: string) => {
      deviceClient.copyText(command);
      toast({ title: "Copied command", duration: 1600 });
    },
    [toast],
  );

  const resetFields = useCallback(() => {
    setName("");
    setRemoteUrl("");
    setAuthToken("");
  }, []);

  const handleConnect = useCallback(async () => {
    const error = getValidationError(remoteUrl, existingRemoteUrls);
    if (error) {
      setConnection({ kind: "error", message: error });
      return;
    }

    setConnection({ kind: "checking" });

    try {
      const headers: Record<string, string> = {};
      if (authToken.trim()) headers.Authorization = `Bearer ${authToken.trim()}`;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${normalizedUrl}/health`, { headers, signal: controller.signal });
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

      await onAddWorkspace({
        name: deriveName(name, normalizedUrl),
        remoteUrl: normalizedUrl,
        authToken: authToken.trim(),
        daemonVersion: body.version,
      });

      setConnection({ kind: "success", version: body.version });
      toast({ title: body.version ? `Connected to daemon v${body.version}` : "Connected to daemon" });
      resetFields();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnection({ kind: "error", message });
    }
  }, [authToken, existingRemoteUrls, name, normalizedUrl, onAddWorkspace, remoteUrl, resetFields, toast]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1 pr-8">
        <h3 className="text-balance text-base font-semibold text-foreground">Add remote workspace</h3>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          Connect to an Argos daemon running on another machine. Local workspace is already managed by the app.
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
          <ConnectionForm
            name={name}
            remoteUrl={remoteUrl}
            authToken={authToken}
            validationError={validationError}
            connection={connection}
            canConnect={canConnect}
            onNameChange={setName}
            onUrlChange={(value) => {
              setRemoteUrl(value);
              setConnection({ kind: "idle" });
            }}
            onTokenChange={setAuthToken}
            onCancel={onCancel}
            onConnect={handleConnect}
            onShowInstructions={() => setView("instructions")}
          />
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
  remoteUrl,
  authToken,
  validationError,
  connection,
  canConnect,
  onNameChange,
  onUrlChange,
  onTokenChange,
  onCancel,
  onConnect,
  onShowInstructions,
}: {
  name: string;
  remoteUrl: string;
  authToken: string;
  validationError: string | null;
  connection: ConnectionState;
  canConnect: boolean;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onCancel?: () => void;
  onConnect: () => void;
  onShowInstructions: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-background p-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="remote-workspace-name">Name</Label>
          <Input
            id="remote-workspace-name"
            placeholder="Build server"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Optional. If empty, Argos uses the daemon host name.</p>
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="remote-workspace-token">Auth token</Label>
          <Input
            id="remote-workspace-token"
            type="password"
            placeholder="Required for remote binds"
            value={authToken}
            onChange={(event) => onTokenChange(event.target.value)}
          />
        </div>

        {connection.kind === "error" && (
          <Alert variant="destructive">
            <Icon icon="lucide:circle-alert" className="size-4" />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>{connection.message}</AlertDescription>
          </Alert>
        )}

        {connection.kind === "success" && (
          <Alert>
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
              {connection.kind === "checking" ? "Checking..." : "Check and add"}
            </Button>
          </div>
        </div>
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
        <InstructionGroup title="Install daemon" description="Pick the command that matches the remote host.">
          {INSTALL_OPTIONS.map((option) => (
            <CommandRow
              key={option.label}
              label={option.label}
              detail={option.detail}
              command={option.command}
              onCopy={onCopyCommand}
            />
          ))}
        </InstructionGroup>

        <InstructionGroup title="Run and verify" description="Use a token before exposing the daemon remotely.">
          {RUN_COMMANDS.map((option) => (
            <CommandRow key={option.label} label={option.label} command={option.command} onCopy={onCopyCommand} />
          ))}
        </InstructionGroup>

        <Alert>
          <Icon icon="lucide:shield-check" className="size-4" />
          <AlertTitle>Remote hosts need a token</AlertTitle>
          <AlertDescription>
            If the daemon binds to anything other than localhost, start it with <code>ARGOS_TOKEN</code> or
            <code>--token</code>, then paste that value in the form.
          </AlertDescription>
        </Alert>

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
