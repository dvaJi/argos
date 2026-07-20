import { describe, expect, it, vi } from "vitest";
import { dispatchModelRoute } from "../../../../src/main/routes/models/modelRouteHandler";
import { modelsGetProviderCatalogRoute } from "@argos/shared-contracts/routes";

describe("dispatchModelRoute models.getProviderCatalog", () => {
  it("proxies the provider catalog to the daemon", async () => {
    const catalog = {
      providerModels: [],
      customModels: [],
      dbProviderModels: [],
      modelStatusMap: {},
    };
    const invokeDaemonRoute = vi.fn(async () => ({ catalog }));
    const configPresenter = {
      getProviderModels: vi.fn(),
      getCustomModels: vi.fn(),
      getDbProviderModels: vi.fn(),
      getBatchModelStatus: vi.fn(),
    };
    const llmProviderPresenter = {
      getModelList: vi.fn(),
      transcribeAudioStandalone: vi.fn(),
    };

    const result = (await dispatchModelRoute(
      {
        configPresenter: configPresenter as any,
        llmProviderPresenter: llmProviderPresenter as any,
        invokeDaemonRoute,
      },
      modelsGetProviderCatalogRoute.name,
      {
        providerId: "aihubmix",
      },
    )) as any;

    expect(invokeDaemonRoute).toHaveBeenCalledWith(modelsGetProviderCatalogRoute.name, { providerId: "aihubmix" });
    expect(configPresenter.getProviderModels).not.toHaveBeenCalled();
    expect(llmProviderPresenter.getModelList).not.toHaveBeenCalled();
    expect(llmProviderPresenter.transcribeAudioStandalone).not.toHaveBeenCalled();
    expect(result.catalog).toEqual(catalog);
  });
});
