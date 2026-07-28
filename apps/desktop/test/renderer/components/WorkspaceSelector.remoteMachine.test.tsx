import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  activeWorkspaceId: "local",
  activeWorkspace: {
    id: "local",
    name: "This computer",
    mode: "local",
    remoteUrl: "",
    createdAt: 0,
  },
  workspaces: [
    {
      id: "local",
      name: "This computer",
      mode: "local",
      remoteUrl: "",
      createdAt: 0,
    },
    {
      id: "remote-1",
      name: "Build machine",
      mode: "remote",
      remoteUrl: "https://secret-host.example.test:9527",
      createdAt: 1,
      credentialRef: "opaque-reference",
      environmentId: "environment-secret-value",
      lastKnownServerVersion: "0.2.0",
      lastKnownProtocolVersion: 1,
      lastKnownCapabilities: ["chat", "sessions"],
      trustState: "paired",
    },
  ],
  connections: {
    "remote-1": { connected: true, lastError: null },
  },
  getWorkspace: vi.fn(),
  switchWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  addWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
}));

vi.mock("#/stores/ui/workspace", () => ({
  useWorkspaceStore: () => store,
}));
vi.mock("#/stores/ui/session", () => ({
  getHasActiveSession: () => false,
}));
vi.mock("#/components/workspace/RemoteWorkspaceSetup", () => ({
  RemoteWorkspaceSetup: ({ initialRemoteUrl }: { initialRemoteUrl?: string }) => (
    <div data-testid="remote-machine-setup">{initialRemoteUrl}</div>
  ),
}));
vi.mock("@iconify/react", () => ({ Icon: () => <span aria-hidden="true" /> }));

import WorkspaceSelector from "#/components/WorkspaceSelector";

describe("WorkspaceSelector remote-machine actions", () => {
  const updateEndpoint = vi.fn();
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store.getWorkspace.mockImplementation((id: string) => store.workspaces.find((workspace) => workspace.id === id));
    store.removeWorkspace.mockResolvedValue({ localRemoved: true, remoteRevoked: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    (window as any).argos = {
      workspace: {
        updateEndpoint,
        rename: vi.fn(),
      },
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  async function openMachines() {
    fireEvent.pointerDown(screen.getByTestId("workspace-selector-trigger"), { button: 0, ctrlKey: false });
    await screen.findByText("Build machine");
  }

  async function openMachineActions() {
    await openMachines();
    fireEvent.click(screen.getByText("Build machine"));
    await screen.findByRole("menuitem", { name: "Edit Build machine address" });
  }

  it("communicates remote connection status with text as well as color", async () => {
    render(<WorkspaceSelector />);
    await openMachines();

    expect(screen.getByText("(connected)")).toBeInTheDocument();
  });

  it("edits an advanced address and reconnects through the identity-checking runtime", async () => {
    render(<WorkspaceSelector />);
    await openMachineActions();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Build machine address" }));
    fireEvent.change(await screen.findByLabelText("Remote machine address"), {
      target: { value: "https://moved.example.test:9443/path?token=must-not-persist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and save" }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledWith("remote-1", "https://moved.example.test:9443"));
    expect(store.updateWorkspace).toHaveBeenCalledWith("remote-1", {
      remoteUrl: "https://moved.example.test:9443",
    });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("same verified machine identity"));
  });

  it("keeps the saved address when identity verification fails", async () => {
    updateEndpoint.mockRejectedValueOnce(new Error("The server identity changed."));
    render(<WorkspaceSelector />);
    await openMachineActions();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Build machine address" }));
    fireEvent.change(await screen.findByLabelText("Remote machine address"), {
      target: { value: "https://replacement.example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and save" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("The server identity changed."));
    expect(store.updateWorkspace).not.toHaveBeenCalled();
  });

  it("opens the pairing flow explicitly for an existing machine", async () => {
    render(<WorkspaceSelector />);
    await openMachineActions();

    fireEvent.click(screen.getByRole("menuitem", { name: "Pair Build machine again" }));

    expect(await screen.findByTestId("remote-machine-setup")).toHaveTextContent(
      "https://secret-host.example.test:9527",
    );
  });

  it("copies diagnostics without hostnames, full identities, credentials, or tokens", async () => {
    render(<WorkspaceSelector />);
    await openMachineActions();

    fireEvent.click(screen.getByRole("menuitem", { name: "Copy Build machine diagnostics" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const diagnostics = writeText.mock.calls[0][0] as string;
    expect(diagnostics).toContain('"environmentId": "environm"');
    expect(diagnostics).toContain('"transport": "https"');
    expect(diagnostics).not.toContain("secret-host");
    expect(diagnostics).not.toContain("environment-secret-value");
    expect(diagnostics).not.toContain("opaque-reference");
    expect(diagnostics).not.toMatch(/token|bearer|credential/i);
  });

  it("explains partial failure when local forget succeeds but remote revoke fails", async () => {
    store.removeWorkspace.mockResolvedValue({ localRemoved: true, remoteRevoked: false });
    render(<WorkspaceSelector />);
    await openMachineActions();

    fireEvent.click(screen.getByRole("menuitem", { name: "Forget Build machine" }));

    await waitFor(() => expect(store.removeWorkspace).toHaveBeenCalledWith("remote-1", true));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("forgotten from this computer"));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("could not be revoked"));
    expect(screen.getByRole("status")).toHaveTextContent("could not be revoked");
  });
});
