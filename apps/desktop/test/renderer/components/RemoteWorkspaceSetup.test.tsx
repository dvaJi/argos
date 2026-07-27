import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();

vi.mock("#/components/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("#api/DeviceClient", () => ({ createDeviceClient: () => ({ copyText: vi.fn() }) }));
vi.mock("@iconify/react", () => ({ Icon: () => <span data-testid="icon" /> }));

import { RemoteWorkspaceSetup } from "#/components/workspace/RemoteWorkspaceSetup";

describe("RemoteWorkspaceSetup", () => {
  beforeEach(() => {
    toast.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    (window as any).argos = {
      workspace: {
        pairRemote: vi.fn(),
        discardCredential: vi.fn(),
      },
    };
  });

  it("pairs first, presents a review, and saves only the opaque credential reference", async () => {
    const addWorkspace = vi.fn();
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: true,
      remoteUrl: "https://build.example.test",
      credentialRef: "machine-opaque-reference",
      sessionId: "session-1",
      environmentId: "environment-1",
      serverVersion: "0.2.0",
    });
    render(<RemoteWorkspaceSetup onAddWorkspace={addWorkspace} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    await screen.findByText("Review remote machine");
    expect(screen.getByText("https://build.example.test")).toBeInTheDocument();
    expect(screen.queryByText("one-time-token")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save machine" }));
    await waitFor(() =>
      expect(addWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialRef: "machine-opaque-reference",
          remoteUrl: "https://build.example.test",
          environmentId: "environment-1",
        }),
      ),
    );
    expect(JSON.stringify(addWorkspace.mock.calls)).not.toContain("one-time-token");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the user in the form with the pairing failure recovery message", async () => {
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: false,
      error: { code: "pairing_expired", message: "This pairing link has expired. Generate a new one on the server." },
    });

    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=expired" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This pairing link has expired");
    expect(screen.getByRole("alert")).toHaveTextContent("Generate a new pairing link on the server");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.queryByText("Review remote machine")).not.toBeInTheDocument();
  });

  it.each([
    ["pairing_invalid", "Paste the complete pairing link"],
    ["pairing_consumed", "Generate a new pairing link"],
    ["endpoint_unreachable", "Check that Argos Server is running"],
    ["endpoint_loopback_remote", "private-network or HTTPS address"],
    ["tls_untrusted", "will not bypass TLS errors"],
    ["secure_storage_unavailable", "secure credential store"],
    ["session_revoked", "pairing link and pair again"],
    ["protocol_incompatible", "supported protocol versions overlap"],
    ["environment_identity_changed", "different machine"],
    ["authenticated_rpc_failed", "copy diagnostics from Machines"],
    ["event_readiness_failed", "event connection"],
    ["capability_missing", "required by Argos Desktop"],
  ])("shows recovery guidance for %s", async (code, recovery) => {
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: false,
      error: { code, message: "Connection failed." },
    });

    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(recovery);
  });

  it("revokes an issued credential when the user returns from review without saving", async () => {
    const discardCredential = vi.mocked((window as any).argos.workspace.discardCredential);
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: true,
      remoteUrl: "https://build.example.test",
      credentialRef: "machine-unsaved-reference",
      environmentId: "environment-1",
    });
    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));
    await screen.findByText("Review remote machine");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(discardCredential).toHaveBeenCalledWith("machine-unsaved-reference"));
    expect(screen.getByLabelText("Pairing link")).toBeInTheDocument();
  });

  it("keeps an authenticated pairing usable when the public health route is unavailable", async () => {
    const addWorkspace = vi.fn();
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: true,
      remoteUrl: "https://private.example.test",
      credentialRef: "machine-opaque-reference",
      environmentId: "environment-1",
      serverVersion: "0.2.0",
    });

    render(<RemoteWorkspaceSetup onAddWorkspace={addWorkspace} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://private.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    await screen.findByText("Review remote machine");
    fireEvent.click(screen.getByRole("button", { name: "Save machine" }));

    await waitFor(() => expect(addWorkspace).toHaveBeenCalledTimes(1));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offers an explicit save-and-switch action without switching on a normal save", async () => {
    const addWorkspace = vi.fn();
    const saveAndSwitch = vi.fn();
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: true,
      remoteUrl: "https://build.example.test",
      credentialRef: "machine-opaque-reference",
      environmentId: "environment-1",
    });

    render(<RemoteWorkspaceSetup onAddWorkspace={addWorkspace} onSaveAndSwitch={saveAndSwitch} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    await screen.findByText("Review remote machine");
    fireEvent.click(screen.getByRole("button", { name: "Save and switch" }));

    await waitFor(() => expect(saveAndSwitch).toHaveBeenCalledTimes(1));
    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("announces pairing progress to assistive technology", async () => {
    vi.mocked((window as any).argos.workspace.pairRemote).mockImplementation(() => new Promise(() => {}));

    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pairing link"), {
      target: { value: "https://build.example.test/pair?token=one-time-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair and add" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Pairing with the remote machine.");
  });

  it("requires a fresh pairing link instead of saving from a raw server URL", () => {
    const { container } = render(
      <RemoteWorkspaceSetup initialRemoteUrl="https://build.example.test" onAddWorkspace={vi.fn()} />,
    );

    expect(container).toHaveTextContent("Previously saved address: https://build.example.test");
    expect(screen.queryByText("Advanced: connect by server URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Daemon URL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair and add" })).toBeDisabled();
  });

  it("requires an explicit confirmation before exposing a network startup command", () => {
    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Need install instructions?" }));

    expect(screen.queryByText("Start (network)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I understand — show network command" }));
    expect(screen.getByText("Start (network)")).toBeInTheDocument();
  });

  it("shows installation commands for the selected remote machine platform", () => {
    render(<RemoteWorkspaceSetup onAddWorkspace={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Need install instructions?" }));

    fireEvent.change(screen.getByLabelText("Other machine"), { target: { value: "windows" } });

    expect(screen.getByText("Windows")).toBeInTheDocument();
    expect(screen.getByText(/install\.ps1/)).toBeInTheDocument();
    expect(screen.getByText(/argos-daemon\.exe --version/)).toBeInTheDocument();
  });
});
