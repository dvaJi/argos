import { beforeEach, describe, expect, it, vi } from "vitest";

// The store module creates its clients at import time; this suite only
// exercises in-memory selection state, so the bridge is never called.
// Any method returns a no-op (event subscriptions get an unsubscribe fn).
const stubClient = () => new Proxy({}, { get: () => () => () => {} });
vi.mock("#api/ProjectClient", () => ({ createProjectClient: stubClient }));
vi.mock("../../../api/ConfigClient", () => ({ createConfigClient: stubClient }));

const { projectStore, selectProject, swapProjectForAgent } = await import("./project");

const reset = () =>
  projectStore.setState((prev) => ({
    ...prev,
    selectedProjectPath: null,
    selectionSource: "none",
    projectByAgentId: {},
  }));

describe("swapProjectForAgent", () => {
  beforeEach(reset);

  it("keeps a user-picked project when switching agents", () => {
    selectProject("/work/app", "manual");
    swapProjectForAgent("codex", "argos");
    expect(projectStore.state.selectedProjectPath).toBe("/work/app");
    expect(projectStore.state.selectionSource).toBe("manual");
  });

  it("keeps a user-picked project even when the incoming agent remembers another", () => {
    selectProject("/work/other", "manual");
    swapProjectForAgent("codex", "argos");
    selectProject("/work/app", "manual");
    swapProjectForAgent("argos", "codex");
    expect(projectStore.state.selectedProjectPath).toBe("/work/app");
  });

  it("restores the incoming agent's remembered project over a default selection", () => {
    selectProject("/work/codex-proj", "manual");
    swapProjectForAgent("argos", "codex");
    selectProject("/work/default", "default");
    swapProjectForAgent("codex", "argos");
    expect(projectStore.state.selectedProjectPath).toBe("/work/codex-proj");
  });

  it("keeps a default selection when the incoming agent has nothing remembered", () => {
    selectProject("/work/default", "default");
    swapProjectForAgent("codex", "argos");
    expect(projectStore.state.selectedProjectPath).toBe("/work/default");
    expect(projectStore.state.selectionSource).toBe("default");
  });
});
