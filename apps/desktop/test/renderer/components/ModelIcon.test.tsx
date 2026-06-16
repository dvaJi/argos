import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/stores/providerStore", () => ({
  useProviderStore: () => ({
    providers: [],
  }),
}));

vi.mock("@/stores/ui/agent", () => ({
  useAgentStore: () => ({
    agents: [],
  }),
}));

describe("ModelIcon", () => {
  it("resolves dimcode-acp to the DimCode icon", async () => {
    const ModelIcon = (await import("@/components/icons/ModelIcon")).default;
    const dimcodeIcon = (await import("@/assets/llm-icons/dimcode.svg?url")).default;
    render(<ModelIcon modelId="dimcode-acp" />);

    const image = screen.getByRole("img");

    expect(image.getAttribute("alt")).toBe("dimcode");
    expect(image.getAttribute("src")).toBe(dimcodeIcon);
  });

  it("resolves novita to the novita.ai icon", async () => {
    const ModelIcon = (await import("@/components/icons/ModelIcon")).default;
    const novitaAiIcon = (await import("@/assets/llm-icons/novitaai.svg?url")).default;
    render(<ModelIcon modelId="novita" />);

    const image = screen.getByRole("img");

    expect(image.getAttribute("alt")).toBe("novita");
    expect(image.getAttribute("src")).toBe(novitaAiIcon);
  });

  it("resolves mistral to the Mistral icon", async () => {
    const ModelIcon = (await import("@/components/icons/ModelIcon")).default;
    const mistralIcon = (await import("@/assets/llm-icons/mistral-color.svg?url")).default;
    render(<ModelIcon modelId="mistral" />);

    const image = screen.getByRole("img");

    expect(image.getAttribute("alt")).toBe("mistral");
    expect(image.getAttribute("src")).toBe(mistralIcon);
  });
});
