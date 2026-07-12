import { describe, expect, it, vi } from "vitest";
import { dispatchModelRoute } from "../../../../src/main/routes/models/modelRouteHandler";
import { modelsGetProviderCatalogRoute } from "@argos/shared-contracts/routes";

describe("dispatchModelRoute models.getProviderCatalog", () => {
  it("reads provider catalog from local configPresenter", async () => {
    const invokeDaemonRoute = vi.fn<(...args: any[]) => any>();
    const configPresenter = {
      getProviderModels: vi.fn(() => []),
      getCustomModels: vi.fn(() => []),
      getDbProviderModels: vi.fn(() => []),
      getBatchModelStatus: vi.fn(() => ({})),
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

    expect(configPresenter.getProviderModels).toHaveBeenCalledWith("aihubmix");
    expect(configPresenter.getCustomModels).toHaveBeenCalledWith("aihubmix");
    expect(configPresenter.getDbProviderModels).toHaveBeenCalledWith("aihubmix");
    expect(configPresenter.getBatchModelStatus).toHaveBeenCalled();
    expect(invokeDaemonRoute).not.toHaveBeenCalled();
    expect(llmProviderPresenter.getModelList).not.toHaveBeenCalled();
    expect(llmProviderPresenter.transcribeAudioStandalone).not.toHaveBeenCalled();
    expect(result.catalog.dbProviderModels).toEqual([]);
  });
});
