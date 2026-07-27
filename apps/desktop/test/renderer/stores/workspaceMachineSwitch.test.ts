import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clearSessionContext: vi.fn(),
  fetchSessions: vi.fn(() => Promise.resolve()),
}));

vi.mock("#/stores/ui/session", () => ({
  clearSessionContextForMachineSwitch: state.clearSessionContext,
  fetchSessions: state.fetchSessions,
}));

vi.mock("@argos/shared/workspaceConfig", () => ({
  LOCAL_WORKSPACE_ID: "local",
  DEFAULT_WORKSPACE_CONFIG: {
    schemaVersion: 2,
    activeWorkspaceId: "local",
    workspaces: [],
  },
  readWorkspaceConfig: vi.fn(),
  writeWorkspaceConfig: vi.fn(),
  notifyWorkspaceConfigChanged: vi.fn(),
  generateWorkspaceId: vi.fn(() => "remote-new"),
}));

import { switchWorkspace, workspaceStore } from "#/stores/ui/workspace";

describe("machine switching", () => {
  beforeEach(() => {
    state.clearSessionContext.mockReset();
    state.fetchSessions.mockReset();
    state.fetchSessions.mockResolvedValue(undefined);
    (window as any).argos = { workspace: { switchTo: vi.fn(() => Promise.resolve()) } };
    workspaceStore.setState(() => ({
      activeWorkspaceId: "local",
      workspaces: [
        { id: "local", name: "This computer", mode: "local", remoteUrl: "", createdAt: 0 },
        {
          id: "remote",
          name: "Build host",
          mode: "remote",
          remoteUrl: "https://build.example.test",
          credentialRef: "machine-ref",
          trustState: "paired",
          createdAt: 1,
        },
      ],
    }));
  });

  it("clears active session context before loading sessions from the selected machine", async () => {
    await switchWorkspace("remote");

    expect((window as any).argos.workspace.switchTo).toHaveBeenCalledWith("remote");
    expect(state.clearSessionContext).toHaveBeenCalledTimes(1);
    expect(state.fetchSessions).toHaveBeenCalledTimes(1);
    expect(workspaceStore.state.activeWorkspaceId).toBe("remote");
  });

  it("keeps the current machine active when the native transport switch fails", async () => {
    (window as any).argos.workspace.switchTo.mockRejectedValueOnce(new Error("offline"));

    await switchWorkspace("remote");

    expect(state.clearSessionContext).not.toHaveBeenCalled();
    expect(state.fetchSessions).not.toHaveBeenCalled();
    expect(workspaceStore.state.activeWorkspaceId).toBe("local");
  });
});
