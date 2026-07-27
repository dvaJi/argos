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
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: "ok", version: "0.2.0" })));

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
    expect(screen.queryByText("Review remote machine")).not.toBeInTheDocument();
  });

  it("revokes an issued credential when the user returns from review without saving", async () => {
    const discardCredential = vi.mocked((window as any).argos.workspace.discardCredential);
    vi.mocked((window as any).argos.workspace.pairRemote).mockResolvedValue({
      ok: true,
      remoteUrl: "https://build.example.test",
      credentialRef: "machine-unsaved-reference",
      environmentId: "environment-1",
    });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));

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
});
