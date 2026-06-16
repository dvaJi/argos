import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelType } from "../../../src/shared/model";

const setup = async () => {
  vi.resetModules();

  vi.doMock("@/stores/providerStore", () => ({
    useProviderStore: () => ({
      sortedProviders: [
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
      currentMode: { value: "agent" },
    }),
  }));

  vi.doMock("@iconify/react", () => ({
    Icon: () => <span className="icon-stub" />,
  }));

  const ModelChooser = (await import("@/components/ModelChooser")).default;

  const onUpdateModel = vi.fn();

  const result = render(<ModelChooser type={[ModelType.Chat]} onUpdateModel={onUpdateModel} />);

  return { ...result, onUpdateModel };
};

describe("ModelChooser", () => {
  it("includes Ollama chat models and excludes Ollama embedding models", async () => {
    const { container, onUpdateModel } = await setup();

    expect(container.textContent).toContain("deepseek-r1:1.5b");
    expect(container.textContent).not.toContain("nomic-embed-text:latest");

    const firstButton = screen.getByRole("button", { name: /deepseek-r1:1.5b/i }) ?? screen.getAllByRole("button")[0];
    await fireEvent.click(firstButton);

    expect(onUpdateModel).toHaveBeenCalledWith([
      { id: "deepseek-r1:1.5b", name: "deepseek-r1:1.5b", type: "chat" },
      "ollama",
    ]);
  });
});
