import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ModelType } from "../../../src/shared/model";

const setup = async (
  options: {
    currentMode?: "agent" | "acp agent";
    props?: Record<string, unknown>;
  } = {},
) => {
  vi.resetModules();

  const currentMode = options.currentMode ?? "agent";

  vi.doMock("@/stores/providerStore", () => ({
    useProviderStore: () => ({
      sortedProviders: [
        { id: "acp", name: "ACP", enable: true },
        { id: "ollama", name: "Ollama", enable: true },
        { id: "openai", name: "OpenAI", enable: true },
      ],
    }),
  }));

  vi.doMock("@/stores/modelStore", () => ({
    useModelStore: () => ({
      enabledModels: [
        {
          providerId: "ollama",
          models: [
            { id: "deepseek-r1:1.5b", name: "deepseek-r1:1.5b", type: "chat" },
            { id: "nomic-embed-text:latest", name: "nomic-embed-text:latest", type: "embedding" },
          ],
        },
        {
          providerId: "acp",
          models: [{ id: "acp-agent", name: "ACP Agent", type: "chat" }],
        },
      ],
    }),
  }));

  vi.doMock("@/stores/theme", () => ({
    useThemeStore: () => ({
      isDark: false,
    }),
  }));

  vi.doMock("@/stores/language", () => ({
    useLanguageStore: () => ({
      dir: "ltr",
    }),
  }));

  vi.doMock("@/components/chat-input/composables/useChatMode", () => ({
    useChatMode: () => ({
      currentMode: { value: currentMode },
    }),
  }));

  vi.doMock("@shadcn/components/ui/input", () => ({
    Input: ({ value, onChange }: any) => <input value={value ?? ""} onChange={onChange} />,
  }));

  vi.doMock("@/components/icons/ModelIcon", () => ({
    default: () => <span className="model-icon-stub" />,
  }));

  const ModelSelect = (await import("@/components/ModelSelect")).default;

  const onUpdateModel = vi.fn<(...args: any[]) => any>();

  const result = render(
    <ModelSelect
      type={[ModelType.Chat]}
      excludeProviders={options.props?.excludeProviders as string[]}
      respectChatMode={options.props?.respectChatMode as boolean}
      onUpdateModel={onUpdateModel}
    />,
  );

  return { ...result, onUpdateModel };
};

describe("ModelSelect", () => {
  it("includes Ollama chat models and excludes Ollama embedding models", async () => {
    const { container, onUpdateModel } = await setup();

    expect(container).toHaveTextContent("deepseek-r1:1.5b");
    expect(container).not.toHaveTextContent("nomic-embed-text:latest");

    const pointers = container.querySelectorAll(".cursor-pointer");
    await act(async () => {
      fireEvent.click(pointers[0]);
    });

    expect(onUpdateModel).toHaveBeenCalledWith([
      { id: "deepseek-r1:1.5b", name: "deepseek-r1:1.5b", type: "chat" },
      "ollama",
    ]);
  });

  it("can ignore chat mode filtering for settings pickers", async () => {
    const { container } = await setup({
      currentMode: "acp agent",
      props: {
        excludeProviders: ["acp"],
        respectChatMode: false,
      },
    });

    expect(container).toHaveTextContent("deepseek-r1:1.5b");
    expect(container).not.toHaveTextContent("ACP Agent");
  });
});
