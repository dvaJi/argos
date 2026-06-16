import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { LLM_PROVIDER } from "../../../src/shared/presenter";

const createProvider = (overrides?: Partial<LLM_PROVIDER>): LLM_PROVIDER => ({
  id: "anthropic",
  name: "Anthropic",
  apiType: "anthropic",
  apiKey: "existing-key",
  baseUrl: "https://api.anthropic.com",
  enable: true,
  custom: false,
  ...overrides,
});

async function setup(options?: { provider?: LLM_PROVIDER; updatedProvider?: LLM_PROVIDER }) {
  vi.resetModules();

  const provider = options?.provider ?? createProvider();
  const providerStore = {
    defaultProviders: [
      {
        id: provider.id,
        websites: {
          official: "https://example.com",
          apiKey: "https://example.com/key",
          docs: "https://example.com/docs",
          models: "https://example.com/models",
          defaultBaseUrl: provider.baseUrl,
        },
      },
    ],
    providers: [options?.updatedProvider ?? provider],
    ensureDefaultProvidersReady: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateProviderApi: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      updated: options?.updatedProvider ?? createProvider({ ...provider, apiKey: "updated-key" }),
    }),
    checkProvider: vi.fn<(...args: any[]) => any>().mockResolvedValue({ isOk: true }),
    getAzureApiVersion: vi.fn<(...args: any[]) => any>().mockResolvedValue("2024-02-01"),
    getGeminiSafety: vi.fn<(...args: any[]) => any>().mockResolvedValue("BLOCK_MEDIUM_AND_ABOVE"),
    removeProvider: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  const modelStore = {
    allProviderModels: [],
    customModels: [],
    refreshProviderModels: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateModelStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    disableAllModels: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };

  vi.doMock("@/stores/providerStore", () => ({
    useProviderStore: () => providerStore,
  }));
  vi.doMock("@/stores/modelStore", () => ({
    useModelStore: () => modelStore,
  }));
  vi.doMock("@/stores/uiSettingsStore", () => ({
    useUiSettingsStore: () => ({
      traceDebugEnabled: false,
    }),
  }));
  vi.doMock("@/stores/modelCheck", () => ({
    useModelCheckStore: () => ({
      openDialog: vi.fn<(...args: any[]) => any>(),
    }),
  }));

  const ModelProviderSettingsDetail = (
    await import("../../../src/renderer/settings/components/ModelProviderSettingsDetail")
  ).default;

  const onProviderConfigured = vi.fn<(...args: any[]) => any>();
  const onProviderModelEnabled = vi.fn<(...args: any[]) => any>();

  const result = render(
    <ModelProviderSettingsDetail
      provider={provider}
      onProviderConfigured={onProviderConfigured}
      onProviderModelEnabled={onProviderModelEnabled}
    />,
  );

  await act(async () => {});

  return {
    ...result,
    providerStore,
    onProviderConfigured,
    onProviderModelEnabled,
  };
}

describe("ModelProviderSettingsDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits provider-configured after saving credentials for an enabled provider", async () => {
    const { providerStore, onProviderConfigured } = await setup();

    await fireEvent.click(screen.getByTestId("save-api-key"));
    await act(async () => {});

    expect(providerStore.updateProviderApi).toHaveBeenCalledWith("anthropic", "updated-key", undefined);
    expect(onProviderConfigured).toHaveBeenCalledTimes(1);
  });

  it("does not emit provider-configured while the provider stays disabled", async () => {
    const provider = createProvider({
      apiKey: "",
      enable: false,
    });
    const { onProviderConfigured } = await setup({
      provider,
      updatedProvider: createProvider({
        apiKey: "updated-key",
        enable: false,
      }),
    });

    await fireEvent.click(screen.getByTestId("save-api-key"));
    await act(async () => {});

    expect(onProviderConfigured).not.toHaveBeenCalled();
  });
});
