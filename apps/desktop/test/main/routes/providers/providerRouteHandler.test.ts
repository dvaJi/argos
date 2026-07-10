import { describe, expect, it, vi } from "vitest";
import { dispatchProviderRoute } from "../../../../src/main/routes/providers/providerRouteHandler";
import {
  providersGetAcpProcessConfigOptionsRoute,
  providersImportApplyRoute,
  providersImportScanRoute,
  providersWarmupAcpProcessRoute,
} from "@shared/contracts/routes";

describe("dispatchProviderRoute providers.listSummaries", () => {
  it("proxies provider summaries through the daemon", async () => {
    const invokeDaemonRoute = vi.fn<(...args: any[]) => any>(() => ({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          apiType: "openai",
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
          enable: true,
        },
      ],
    }));
    const llmProviderPresenter = {
      getProviderRateLimitStatus: vi.fn(),
      listOllamaModels: vi.fn(),
      listOllamaRunningModels: vi.fn(),
      pullOllamaModels: vi.fn(),
    };

    const result = (await dispatchProviderRoute(
      {
        invokeDaemonRoute,
        llmProviderPresenter: llmProviderPresenter as any,
        providerImportService: {} as any,
      },
      "providers.listSummaries",
      {},
    )) as {
      providers: Array<Record<string, unknown>>;
    };

    expect(result.providers).toEqual([
      expect.objectContaining({
        id: "openai",
        name: "OpenAI",
        apiType: "openai",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        enable: true,
      }),
    ]);
    expect(invokeDaemonRoute).toHaveBeenCalledWith("providers.listSummaries", {});
    expect(llmProviderPresenter.getProviderRateLimitStatus).not.toHaveBeenCalled();
    expect(llmProviderPresenter.listOllamaModels).not.toHaveBeenCalled();
    expect(llmProviderPresenter.listOllamaRunningModels).not.toHaveBeenCalled();
    expect(llmProviderPresenter.pullOllamaModels).not.toHaveBeenCalled();
  });
});

describe("dispatchProviderRoute provider import routes", () => {
  it("keeps scan and apply on the desktop-local path", async () => {
    const invokeDaemonRoute = vi.fn();
    const providerImportService = {
      scan: vi.fn<(...args: any[]) => any>(() => ({
        sessionId: "scan-1",
        sourceOrder: ["cc-switch", "alma", "cherry-studio", "hermes", "openclaw"],
        sources: [],
        providers: [],
      })),
      apply: vi.fn<(...args: any[]) => any>(() => ({
        summary: {
          imported: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          overwritten: 0,
          models: 0,
        },
        results: [],
      })),
    };

    const scanResult = await dispatchProviderRoute(
      {
        invokeDaemonRoute,
        llmProviderPresenter: {} as any,
        providerImportService: providerImportService as any,
      },
      providersImportScanRoute.name,
      {},
    );
    const applyInput = {
      sessionId: "scan-1",
      selections: [
        {
          sourceId: "hermes",
          providerIds: ["hermes:openai"],
          providerOptions: {
            "hermes:openai": {
              targetApiType: "anthropic",
            },
          },
        },
      ],
    };
    const applyResult = await dispatchProviderRoute(
      {
        invokeDaemonRoute,
        llmProviderPresenter: {} as any,
        providerImportService: providerImportService as any,
      },
      providersImportApplyRoute.name,
      applyInput,
    );

    expect(scanResult).toMatchObject({ sessionId: "scan-1" });
    expect(applyResult).toMatchObject({ summary: { imported: 0 } });
    expect(providerImportService.scan).toHaveBeenCalledTimes(1);
    expect(providerImportService.apply).toHaveBeenCalledWith(applyInput);
    expect(invokeDaemonRoute).not.toHaveBeenCalled();
  });
});

describe("dispatchProviderRoute provider ACP routes", () => {
  it("routes warmup and ACP config options through the daemon", async () => {
    const invokeDaemonRoute = vi.fn<(...args: any[]) => any>((route: string) => {
      if (route === providersWarmupAcpProcessRoute.name) {
        return { warmedUp: true };
      }
      if (route === providersGetAcpProcessConfigOptionsRoute.name) {
        return { state: null };
      }
      return undefined;
    });
    const llmProviderPresenter = {
      getProviderRateLimitStatus: vi.fn(),
      listOllamaModels: vi.fn(),
      listOllamaRunningModels: vi.fn(),
      pullOllamaModels: vi.fn(),
    };

    const warmupResult = await dispatchProviderRoute(
      {
        invokeDaemonRoute,
        providerImportService: {} as any,
        llmProviderPresenter: llmProviderPresenter as any,
      },
      providersWarmupAcpProcessRoute.name,
      {
        agentId: "agent-1",
        workdir: "/tmp/project",
      },
    );
    const optionsResult = await dispatchProviderRoute(
      {
        invokeDaemonRoute,
        providerImportService: {} as any,
        llmProviderPresenter: {} as any,
      },
      providersGetAcpProcessConfigOptionsRoute.name,
      {
        agentId: "agent-1",
        workdir: "/tmp/project",
      },
    );

    expect(warmupResult).toEqual({ warmedUp: true });
    expect(optionsResult).toEqual({ state: null });
    expect(invokeDaemonRoute).toHaveBeenCalledWith(providersWarmupAcpProcessRoute.name, {
      agentId: "agent-1",
      workdir: "/tmp/project",
    });
    expect(invokeDaemonRoute).toHaveBeenCalledWith(providersGetAcpProcessConfigOptionsRoute.name, {
      agentId: "agent-1",
      workdir: "/tmp/project",
    });
    expect(llmProviderPresenter.getProviderRateLimitStatus).not.toHaveBeenCalled();
    expect(llmProviderPresenter.listOllamaModels).not.toHaveBeenCalled();
    expect(llmProviderPresenter.listOllamaRunningModels).not.toHaveBeenCalled();
    expect(llmProviderPresenter.pullOllamaModels).not.toHaveBeenCalled();
  });
});
