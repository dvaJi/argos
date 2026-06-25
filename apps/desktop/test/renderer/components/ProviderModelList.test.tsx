import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ModelType } from "@shared/model";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProviderModelList", () => {
  it("filters by capability and type, then switches sorting from status to name", async () => {
    vi.resetModules();

    const modelStore = {
      removeCustomModel: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      enableAllModels: vi.fn<(...args: any[]) => any>(),
      disableAllModels: vi.fn<(...args: any[]) => any>(),
    };

    vi.doMock("@/stores/modelStore", () => ({
      useModelStore: () => modelStore,
    }));
    vi.doMock("@/stores/uiSettingsStore", () => ({
      useUiSettingsStore: () => ({
        traceDebugEnabled: false,
      }),
    }));

    const ProviderModelList = (await import("../../../src/renderer/settings/components/ProviderModelList")).default;

    const { container } = render(
      <ProviderModelList
        providerModels={[
          {
            providerId: "anthropic",
            models: [
              {
                id: "zeta-vision",
                name: "Zeta Vision",
                group: "default",
                providerId: "anthropic",
                enabled: true,
                vision: true,
                type: ModelType.Chat,
              },
              {
                id: "alpha-vision",
                name: "Alpha Vision",
                group: "default",
                providerId: "anthropic",
                enabled: false,
                vision: true,
                type: ModelType.Chat,
              },
              {
                id: "beta-embedding",
                name: "Beta Embedding",
                group: "default",
                providerId: "anthropic",
                enabled: true,
                type: ModelType.Embedding,
              },
            ],
          },
        ]}
        customModels={[
          {
            id: "custom-reasoner",
            name: "Custom Reasoner",
            group: "default",
            providerId: "anthropic",
            enabled: true,
            reasoning: true,
            type: ModelType.Chat,
            isCustom: true,
          },
        ]}
        providers={[{ id: "anthropic", name: "Anthropic" }]}
        isLoading={false}
      />,
    );

    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByTestId("model-capability-filter-vision"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("model-type-filter-chat"));
    });
    await act(async () => {});

    const getVisibleIds = () =>
      Array.from(container.querySelectorAll("[data-model-id]")).map((el) => el.getAttribute("data-model-id")!);

    expect(getVisibleIds()).toEqual(["zeta-vision", "alpha-vision"]);
    expect(container).toHaveTextContent("visible:2/4");

    await act(async () => {
      fireEvent.click(screen.getByTestId("model-sort-name"));
    });
    await act(async () => {});

    expect(getVisibleIds()).toEqual(["alpha-vision", "zeta-vision"]);
  });
});
