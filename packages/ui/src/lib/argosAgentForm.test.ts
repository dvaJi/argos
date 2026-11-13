import { describe, expect, it } from "vitest";
import type { Agent } from "@argos/shared/types/agent-interface";
import {
  buildAgentConfigFromForm,
  buildAgentUpdatePayload,
  buildFormFromAgent,
  getDirtyKeys,
  getModelField,
  setModelField,
} from "./argosAgentForm";

const makeAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
    id: "argos-1",
    name: "Builder",
    type: "argos",
    enabled: true,
    config: {},
    ...overrides,
  }) as Agent;

describe("buildAgentUpdatePayload", () => {
  it("does not send the avatar when it is unchanged (keeps legacy/built-in icons)", () => {
    const agent = makeAgent({ icon: "legacy-logo", avatar: undefined });
    const baseline = buildFormFromAgent(agent);
    const payload = buildAgentUpdatePayload({ ...baseline, name: "Renamed" }, baseline);
    expect(payload.avatar).toBeUndefined();
    expect(payload.name).toBe("Renamed");
  });

  it("sends the avatar when the user changed it", () => {
    const baseline = buildFormFromAgent(makeAgent());
    const payload = buildAgentUpdatePayload({ ...baseline, lucideIcon: "brain" }, baseline);
    expect(payload.avatar).toEqual({ kind: "lucide", icon: "brain", lightColor: "#0f172a", darkColor: "#e5e7eb" });
  });
});

describe("buildAgentConfigFromForm", () => {
  it("drops memory models when memory is off but keeps the decision model", () => {
    let form = buildFormFromAgent(makeAgent());
    form = setModelField(form, "memoryEmbedding", "openai", "embed");
    form = setModelField(form, "memoryExtraction", "openai", "gpt");
    form = setModelField(form, "decisionModel", "openrouter", "jev");
    const config = buildAgentConfigFromForm({ ...form, memoryEnabled: false, permissionAutoApproval: true });
    expect(config.memoryEmbedding).toBeNull();
    expect(config.memoryExtractionModel).toBeNull();
    expect(config.decisionModel).toEqual({ providerId: "openrouter", modelId: "jev" });
  });

  it("clamps auto-compaction numbers to the save ranges", () => {
    const form = buildFormFromAgent(makeAgent());
    const config = buildAgentConfigFromForm({
      ...form,
      autoCompactionTriggerThreshold: 100,
      autoCompactionRetainRecentPairs: 0,
    });
    expect(config.autoCompactionTriggerThreshold).toBe(95);
    expect(config.autoCompactionRetainRecentPairs).toBe(1);
  });

  it("omits enabledMcpServerIds when every server is allowed", () => {
    const form = buildFormFromAgent(makeAgent());
    expect("enabledMcpServerIds" in buildAgentConfigFromForm(form)).toBe(false);
    expect(buildAgentConfigFromForm({ ...form, enabledMcpServerIds: ["fs"] }).enabledMcpServerIds).toEqual(["fs"]);
  });
});

describe("form helpers", () => {
  it("round-trips an agent without spurious dirty keys", () => {
    const agent = makeAgent({
      config: {
        systemPrompt: "Be terse",
        defaultModelPreset: { providerId: "anthropic", modelId: "claude" },
        enabledMcpServerIds: ["fs"],
      },
    });
    const form = buildFormFromAgent(agent);
    expect(getDirtyKeys(form, buildFormFromAgent(agent))).toEqual([]);
    expect(getModelField(form, "defaultModel")).toEqual({ providerId: "anthropic", modelId: "claude" });
  });

  it("reports edited keys", () => {
    const baseline = buildFormFromAgent(makeAgent());
    const edited = setModelField({ ...baseline, systemPrompt: "x" }, "visionModel", "p", "m");
    expect(getDirtyKeys(edited, baseline).sort()).toEqual(["systemPrompt", "visionModelId", "visionModelProviderId"]);
  });
});
