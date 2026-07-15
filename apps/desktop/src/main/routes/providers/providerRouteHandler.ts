import type { ILlmProviderPresenter } from "@argos/shared/presenter";
import {
  providersAddRoute,
  providersGetAcpProcessConfigOptionsRoute,
  providersGetRateLimitStatusRoute,
  providersImportApplyRoute,
  providersImportScanRoute,
  providersListDefaultsRoute,
  providersListOllamaModelsRoute,
  providersListOllamaRunningModelsRoute,
  providersListRoute,
  providersListSummariesRoute,
  providersPullOllamaModelRoute,
  providersRefreshModelsRoute,
  providersRemoveRoute,
  providersReorderRoute,
  providersSetByIdRoute,
  providersUpdateRoute,
  providersWarmupAcpProcessRoute,
} from "@argos/shared-contracts/routes";
import type { ProviderImportService } from "@argos/backend-core";

export async function dispatchProviderRoute(
  deps: {
    llmProviderPresenter: ILlmProviderPresenter;
    providerImportService: ProviderImportService;
    invokeDaemonRoute: (routeName: string, rawInput: unknown) => Promise<unknown>;
  },
  routeName: string,
  rawInput: unknown,
): Promise<unknown> {
  const { llmProviderPresenter, providerImportService, invokeDaemonRoute } = deps;

  switch (routeName) {
    case providersListRoute.name: {
      const input = providersListRoute.input.parse(rawInput);
      return providersListRoute.output.parse(await invokeDaemonRoute(providersListRoute.name, input));
    }

    case providersListSummariesRoute.name: {
      const input = providersListSummariesRoute.input.parse(rawInput);
      return providersListSummariesRoute.output.parse(await invokeDaemonRoute(providersListSummariesRoute.name, input));
    }

    case providersListDefaultsRoute.name: {
      const input = providersListDefaultsRoute.input.parse(rawInput);
      return providersListDefaultsRoute.output.parse(await invokeDaemonRoute(providersListDefaultsRoute.name, input));
    }

    case providersSetByIdRoute.name: {
      const input = providersSetByIdRoute.input.parse(rawInput);
      return providersSetByIdRoute.output.parse(await invokeDaemonRoute(providersSetByIdRoute.name, input));
    }

    case providersUpdateRoute.name: {
      const input = providersUpdateRoute.input.parse(rawInput);
      return providersUpdateRoute.output.parse(await invokeDaemonRoute(providersUpdateRoute.name, input));
    }

    case providersAddRoute.name: {
      const input = providersAddRoute.input.parse(rawInput);
      return providersAddRoute.output.parse(await invokeDaemonRoute(providersAddRoute.name, input));
    }

    case providersRemoveRoute.name: {
      const input = providersRemoveRoute.input.parse(rawInput);
      return providersRemoveRoute.output.parse(await invokeDaemonRoute(providersRemoveRoute.name, input));
    }

    case providersReorderRoute.name: {
      const input = providersReorderRoute.input.parse(rawInput);
      return providersReorderRoute.output.parse(await invokeDaemonRoute(providersReorderRoute.name, input));
    }

    case providersGetRateLimitStatusRoute.name: {
      // Shell-only: rate-limit status is real-time runtime state tied to the local
      // provider instances. The daemon currently returns a stub for this route, so the
      // desktop keeps owning it until the daemon tracks real per-provider rate limits.
      const input = providersGetRateLimitStatusRoute.input.parse(rawInput);
      return providersGetRateLimitStatusRoute.output.parse({
        status: llmProviderPresenter.getProviderRateLimitStatus(input.providerId),
      });
    }

    case providersRefreshModelsRoute.name: {
      const input = providersRefreshModelsRoute.input.parse(rawInput);
      return providersRefreshModelsRoute.output.parse(await invokeDaemonRoute(providersRefreshModelsRoute.name, input));
    }

    case providersListOllamaModelsRoute.name: {
      const input = providersListOllamaModelsRoute.input.parse(rawInput);
      return providersListOllamaModelsRoute.output.parse(
        await invokeDaemonRoute(providersListOllamaModelsRoute.name, input),
      );
    }

    case providersListOllamaRunningModelsRoute.name: {
      const input = providersListOllamaRunningModelsRoute.input.parse(rawInput);
      return providersListOllamaRunningModelsRoute.output.parse(
        await invokeDaemonRoute(providersListOllamaRunningModelsRoute.name, input),
      );
    }

    case providersPullOllamaModelRoute.name: {
      const input = providersPullOllamaModelRoute.input.parse(rawInput);
      return providersPullOllamaModelRoute.output.parse(
        await invokeDaemonRoute(providersPullOllamaModelRoute.name, input),
      );
    }

    case providersWarmupAcpProcessRoute.name: {
      const input = providersWarmupAcpProcessRoute.input.parse(rawInput);
      return providersWarmupAcpProcessRoute.output.parse(
        await invokeDaemonRoute(providersWarmupAcpProcessRoute.name, input),
      );
    }

    case providersGetAcpProcessConfigOptionsRoute.name: {
      const input = providersGetAcpProcessConfigOptionsRoute.input.parse(rawInput);
      return providersGetAcpProcessConfigOptionsRoute.output.parse(
        await invokeDaemonRoute(providersGetAcpProcessConfigOptionsRoute.name, input),
      );
    }

    case providersImportScanRoute.name: {
      providersImportScanRoute.input.parse(rawInput);
      return providersImportScanRoute.output.parse(await providerImportService.scan());
    }

    case providersImportApplyRoute.name: {
      const input = providersImportApplyRoute.input.parse(rawInput);
      return providersImportApplyRoute.output.parse(providerImportService.apply(input));
    }

    default:
      return undefined;
  }
}
