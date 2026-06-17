import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { LLM_PROVIDER } from "../../../src/shared/presenter";

const passthrough = (name: string) => (props: any) => <div>{props.children}</div>;

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "deepseek",
  name: "DeepSeek",
  apiType: "openai-compatible",
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com/v1",
  enable: true,
  custom: false,
  ...overrides,
});

async function setup(options?: {
  provider?: LLM_PROVIDER;
  providerWebsites?: {
    official: string;
    apiKey: string;
    docs: string;
    models: string;
    defaultBaseUrl: string;
  };
}) {
  vi.resetModules();

  const toast = vi.fn<(...args: any[]) => any>();
  const llmproviderPresenter = {
    getKeyStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    refreshModels: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };
  const modelCheckStore = {
    openDialog: vi.fn<(...args: any[]) => any>(),
  };

  vi.doMock("@api/legacy/presenters", () => ({
    useLegacyPresenter: (name: string, opts?: { safeCall?: boolean }) => {
      if (name === "llmproviderPresenter") return llmproviderPresenter;
      throw new Error(`Unexpected presenter: ${name}`);
    },
  }));

  vi.doMock("@/stores/modelCheck", () => ({
    useModelCheckStore: () => modelCheckStore,
  }));
  vi.doMock("@/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));

  vi.doMock("@shadcn/components/ui/input", () => ({
    Input: ({ value, onChange, ...rest }: any) => <input value={value ?? ""} onChange={onChange} {...rest} />,
  }));
  vi.doMock("@shadcn/components/ui/button", () => ({
    Button: ({ children, onClick, ...rest }: any) => (
      <button type="button" onClick={onClick} {...rest}>
        {children}
      </button>
    ),
  }));
  vi.doMock("@shadcn/components/ui/label", () => ({
    Label: ({ children, ...rest }: any) => <label {...rest}>{children}</label>,
  }));
  vi.doMock("@shadcn/components/ui/tooltip", () => ({
    Tooltip: passthrough("Tooltip"),
    TooltipContent: passthrough("TooltipContent"),
    TooltipProvider: passthrough("TooltipProvider"),
    TooltipTrigger: passthrough("TooltipTrigger"),
  }));
  vi.doMock("@iconify/react", () => ({
    Icon: () => <i />,
  }));

  const ProviderApiConfig = (await import("../../../src/renderer/settings/components/ProviderApiConfig")).default;

  const onApiHostChange = vi.fn<(...args: any[]) => any>();
  const onValidateKey = vi.fn<(...args: any[]) => any>();

  const result = render(
    <ProviderApiConfig
      provider={options?.provider ?? createProvider()}
      providerWebsites={
        options?.providerWebsites ?? {
          official: "https://example.com",
          apiKey: "https://example.com/key",
          docs: "https://example.com/docs",
          models: "https://example.com/models",
          defaultBaseUrl: "https://api.deepseek.com/v1",
        }
      }
      onApiHostChange={onApiHostChange}
      onValidateKey={onValidateKey}
    />,
  );

  await act(async () => {});

  return {
    ...result,
    toast,
    llmproviderPresenter,
    modelCheckStore,
    onApiHostChange,
    onValidateKey,
  };
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
}

describe("ProviderApiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a locked Base URL display for built-in providers outside the allowlist", async () => {
    const { container, llmproviderPresenter } = await setup();

    expect(container.querySelector("input#deepseek-url")).toBeFalsy();
    expect(container).toHaveTextContent("This provider is pinned to the recommended Base URL.");
    expect(findButtonByText(container, "Modify")).toBeDefined();
    expect(container.innerHTML).not.toContain("Fill into API URL");
    expect(llmproviderPresenter.getKeyStatus).toHaveBeenCalledWith("deepseek");
  });

  it("switches directly into edit mode and hides the modify button", async () => {
    const { container } = await setup();
    const modifyButton = findButtonByText(container, "Modify")!;

    expect(modifyButton).toBeDefined();
    await act(async () => {
      fireEvent.click(modifyButton);
    });
    await act(async () => {});

    expect(container.querySelector("input#deepseek-url")).toBeTruthy();
    expect(findButtonByText(container, "Modify")).toBeUndefined();
  });

  it("keeps OpenAI Responses editable without the lock prompt", async () => {
    const { container } = await setup({
      provider: createProvider({
        id: "openai-responses",
        name: "OpenAI Responses",
        baseUrl: "https://api.openai.com/v1",
      }),
    });

    expect(container.querySelector("input#openai-responses-url")).toBeTruthy();
    expect(findButtonByText(container, "Modify")).toBeUndefined();
    expect(container).not.toHaveTextContent("This provider is pinned to the recommended Base URL.");
  });

  it("keeps custom providers editable by default", async () => {
    const { container } = await setup({
      provider: createProvider({
        id: "custom-demo",
        name: "Custom Demo",
        custom: true,
        baseUrl: "https://custom.example.com/v1",
      }),
    });

    expect(container.querySelector("input#custom-demo-url")).toBeTruthy();
    expect(findButtonByText(container, "Modify")).toBeUndefined();
  });

  it("disables provider verification when the provider is not enabled", async () => {
    const { container, modelCheckStore } = await setup({
      provider: createProvider({
        enable: false,
      }),
    });

    const verifyButton = screen.getByTestId("provider-verify-button") as HTMLButtonElement;

    expect(verifyButton.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(verifyButton);
    });
    await act(async () => {});

    expect(modelCheckStore.openDialog).not.toHaveBeenCalled();
  });

  it("does not emit validation from the API key enter shortcut when the provider is disabled", async () => {
    const { container, onValidateKey } = await setup({
      provider: createProvider({
        enable: false,
      }),
    });

    const apiKeyInput = container.querySelector("input#deepseek-apikey")!;
    await act(async () => {
      fireEvent.keyUp(apiKeyInput, { key: "Enter" });
    });
    await act(async () => {});

    expect(onValidateKey).not.toHaveBeenCalled();
  });

  it("requests the presenter with safeCall disabled so refresh errors can surface", async () => {
    const useLegacyPresenter = vi.fn<(...args: any[]) => any>((name: string) => {
      if (name === "llmproviderPresenter")
        return { getKeyStatus: vi.fn<(...args: any[]) => any>(), refreshModels: vi.fn<(...args: any[]) => any>() };
      throw new Error(`Unexpected presenter: ${name}`);
    });

    vi.resetModules();
    vi.doMock("@api/legacy/presenters", () => ({
      useLegacyPresenter,
    }));
    vi.doMock("@/stores/modelCheck", () => ({
      useModelCheckStore: () => ({ openDialog: vi.fn<(...args: any[]) => any>() }),
    }));
    vi.doMock("@/components/use-toast", () => ({
      useToast: () => ({ toast: vi.fn<(...args: any[]) => any>() }),
    }));
    vi.doMock("@shadcn/components/ui/input", () => ({
      Input: (props: any) => <input value={props.value ?? ""} onChange={props.onChange} />,
    }));
    vi.doMock("@shadcn/components/ui/button", () => ({
      Button: (props: any) => <button onClick={props.onClick}>{props.children}</button>,
    }));
    vi.doMock("@shadcn/components/ui/label", () => ({
      Label: (props: any) => <label>{props.children}</label>,
    }));
    vi.doMock("@shadcn/components/ui/tooltip", () => ({
      Tooltip: passthrough("Tooltip"),
      TooltipContent: passthrough("TooltipContent"),
      TooltipProvider: passthrough("TooltipProvider"),
      TooltipTrigger: passthrough("TooltipTrigger"),
    }));

    const ProviderApiConfig = (await import("../../../src/renderer/settings/components/ProviderApiConfig")).default;

    render(
      <ProviderApiConfig
        provider={createProvider()}
        providerWebsites={{
          official: "https://example.com",
          apiKey: "https://example.com/key",
          docs: "https://example.com/docs",
          models: "https://example.com/models",
          defaultBaseUrl: "https://api.deepseek.com/v1",
        }}
      />,
    );

    expect(useLegacyPresenter).toHaveBeenCalledWith("llmproviderPresenter", { safeCall: false });
  });
});
