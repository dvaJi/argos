import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@argos/shared/types/agent-interface";

// Smoke test for the Argos agents settings page: edits show the unsaved bar,
// Save sends the payload, and an untouched avatar is not sent (so legacy and
// built-in icons survive).

const agent = {
  id: "argos-1",
  name: "Builder",
  type: "argos",
  enabled: true,
  icon: "legacy-logo",
  config: { systemPrompt: "Be terse" },
} as unknown as Agent;

const updateArgosAgent = vi.fn<(id: string, updates: Record<string, unknown>) => Promise<Agent | null>>(
  async (_id, updates) => ({ ...agent, name: String(updates.name ?? agent.name) }) as Agent,
);

let listedAgents: Agent[] = [agent, { id: "acp-1", name: "Claude Code", type: "acp", enabled: true } as Agent];

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({
    listAgents: async () => listedAgents,
    updateArgosAgent,
    getSetting: async () => false,
    getSystemPrompts: async () => [],
  }),
}));
vi.mock("#api/SessionClient", () => ({ createSessionClient: () => ({}) }));
vi.mock("#api/ToolClient", () => ({ createToolClient: () => ({ getAllToolDefinitions: async () => [] }) }));
vi.mock("#/components/use-toast", () => ({ toast: vi.fn<() => void>() }));
vi.mock("#/stores/modelStore", () => ({ useModelStore: () => ({ enabledModels: [] }) }));
vi.mock("#/components/ModelSelect", () => ({ default: () => null }));
vi.mock("#/components/icons/ModelIcon", () => ({ default: () => null }));
vi.mock("#/components/FolderPicker", () => ({ default: () => null }));
vi.mock("#/components/icons/AgentAvatar", () => ({ default: () => null }));
vi.mock("#/components/agent/AgentTransferDialog", () => ({ default: () => null }));
vi.mock("#settings/components/MemoryManagerDialog", () => ({ MemoryManagerDialog: () => null }));
vi.mock("#settings/components/AgentExtensionPolicyPanel", () => ({ default: () => null }));
vi.mock("#settings/components/PiPackagesPanel", () => ({ default: () => null }));

const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => await Promise.resolve());
};

const typeInto = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("ArgosAgentsSettings page", () => {
  it("tracks unsaved edits and saves without clobbering the avatar", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { default: ArgosAgentsSettings } = await import("#settings/components/ArgosAgentsSettings");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ArgosAgentsSettings />));
    await flush();

    // Only Argos agents are listed in the sidebar.
    const nav = container.querySelector("nav[aria-label='Argos agents']");
    expect(nav?.textContent).toContain("Builder");
    expect(nav?.textContent).not.toContain("Claude Code");
    expect(container.textContent).not.toContain("Unsaved changes");

    const nameInput = container.querySelector<HTMLInputElement>("#argos-agent-name");
    expect(nameInput?.value).toBe("Builder");
    await act(async () => typeInto(nameInput!, "Reviewer"));
    expect(container.textContent).toContain("Unsaved changes");
    expect(container.textContent).toContain("in General");

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Save"));
    await act(async () => saveButton!.click());
    await flush();

    expect(updateArgosAgent).toHaveBeenCalledTimes(1);
    const [id, payload] = updateArgosAgent.mock.calls[0];
    expect(id).toBe("argos-1");
    expect(payload.name).toBe("Reviewer");
    expect(payload.avatar).toBeUndefined();
    expect(container.textContent).not.toContain("Unsaved changes");

    await act(async () => root.unmount());
    container.remove();
  });

  it("does not offer avatar editing for the built-in agent and can restore its logo", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // A built-in agent whose logo was hidden by a previously saved custom avatar.
    listedAgents = [
      {
        id: "argos",
        name: "Argos",
        type: "argos",
        enabled: true,
        protected: true,
        avatar: { kind: "lucide", icon: "bot" },
        config: {},
      } as unknown as Agent,
    ];
    updateArgosAgent.mockClear();
    const { default: ArgosAgentsSettings } = await import("#settings/components/ArgosAgentsSettings");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ArgosAgentsSettings />));
    await flush();

    expect(container.querySelector("[aria-label='Avatar style']")).toBeNull();
    const restore = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Restore Argos logo"),
    );
    expect(restore).toBeTruthy();
    await act(async () => restore!.click());
    await flush();
    expect(updateArgosAgent).toHaveBeenCalledWith("argos", { avatar: null });

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps edits made while a save is in flight", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    listedAgents = [agent, { id: "acp-1", name: "Claude Code", type: "acp", enabled: true } as Agent];
    updateArgosAgent.mockClear();
    const { default: ArgosAgentsSettings } = await import("#settings/components/ArgosAgentsSettings");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ArgosAgentsSettings />));
    await flush();

    // The save hangs until the test releases it: edits made meanwhile must
    // survive the response instead of being clobbered by it.
    let release!: (value: Agent | null) => void;
    updateArgosAgent.mockImplementationOnce(
      () =>
        new Promise<Agent | null>((resolve) => {
          release = resolve;
        }),
    );
    await act(async () => typeInto(container.querySelector<HTMLInputElement>("#argos-agent-name")!, "Slow save"));
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Save"));
    await act(async () => saveButton!.click());
    await act(async () =>
      typeInto(container.querySelector<HTMLInputElement>("#argos-agent-description")!, "Edited during flight"),
    );
    await act(async () => release({ ...agent, name: "Slow save" } as Agent));
    await flush();

    const [savedId, payload] = updateArgosAgent.mock.calls[0];
    expect(savedId).toBe("argos-1");
    expect(payload.name).toBe("Slow save");
    expect(payload.avatar).toBeUndefined();
    // The in-flight edit survived and is pending as an unsaved change.
    expect(container.querySelector<HTMLInputElement>("#argos-agent-description")?.value).toBe("Edited during flight");
    expect(container.textContent).toContain("Unsaved changes");

    await act(async () => root.unmount());
    container.remove();
  });
});
