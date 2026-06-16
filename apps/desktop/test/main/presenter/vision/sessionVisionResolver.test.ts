import { describe, expect, it, vi } from "vitest";
import { resolveSessionVisionTarget } from "../../../../src/main/presenter/vision/sessionVisionResolver";

describe("resolveSessionVisionTarget", () => {
  it("uses the current session model when it is explicitly known and supports vision", async () => {
    const configPresenter = {
      isKnownModel: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
      getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({ vision: true }),
      resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
    };

    const result = await resolveSessionVisionTarget({
      providerId: "openai",
      modelId: "gpt-4o",
      agentId: "argos",
      configPresenter,
    });

    expect(result).toEqual({
      providerId: "openai",
      modelId: "gpt-4o",
      source: "session-model",
    });
    expect(configPresenter.resolveArgosAgentConfig).not.toHaveBeenCalled();
  });

  it("ignores synthesized session-model vision support when the model is unknown", async () => {
    const configPresenter = {
      isKnownModel: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
      getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({ vision: true }),
      resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        visionModel: { providerId: "google", modelId: "gemini-2.5-flash" },
      }),
    };

    const result = await resolveSessionVisionTarget({
      providerId: "openai",
      modelId: "unknown-vision-model",
      agentId: "argos",
      configPresenter,
    });

    expect(result).toEqual({
      providerId: "google",
      modelId: "gemini-2.5-flash",
      source: "agent-vision-model",
    });
  });
});
