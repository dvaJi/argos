import type { ILlmProviderPresenter } from "@argos/shared/presenter";
import {
  modelsAddCustomRoute,
  modelsExportConfigsRoute,
  modelsGetCapabilitiesRoute,
  modelsGetConfigRoute,
  modelsGetProviderCatalogRoute,
  modelsGetProviderConfigsRoute,
  modelsHasUserConfigRoute,
  modelsImportConfigsRoute,
  modelsListRuntimeRoute,
  modelsRemoveCustomRoute,
  modelsResetConfigRoute,
  modelsSetBatchStatusRoute,
  modelsSetConfigRoute,
  modelsSetStatusRoute,
  modelsTranscribeAudioRoute,
  modelsUpdateCustomRoute,
} from "@argos/shared-contracts/routes";
export async function dispatchModelRoute(
  deps: {
    llmProviderPresenter: ILlmProviderPresenter;
    invokeDaemonRoute: (route: string, input: unknown) => Promise<unknown>;
  },
  routeName: string,
  rawInput: unknown,
): Promise<unknown> {
  const { llmProviderPresenter, invokeDaemonRoute } = deps;

  switch (routeName) {
    case modelsGetProviderCatalogRoute.name: {
      const input = modelsGetProviderCatalogRoute.input.parse(rawInput);
      return modelsGetProviderCatalogRoute.output.parse(
        await invokeDaemonRoute(modelsGetProviderCatalogRoute.name, input),
      );
    }

    case modelsListRuntimeRoute.name: {
      const input = modelsListRuntimeRoute.input.parse(rawInput);
      return modelsListRuntimeRoute.output.parse(await invokeDaemonRoute(modelsListRuntimeRoute.name, input));
    }

    case modelsSetBatchStatusRoute.name: {
      const input = modelsSetBatchStatusRoute.input.parse(rawInput);
      return modelsSetBatchStatusRoute.output.parse(await invokeDaemonRoute(modelsSetBatchStatusRoute.name, input));
    }

    case modelsSetStatusRoute.name: {
      const input = modelsSetStatusRoute.input.parse(rawInput);
      return modelsSetStatusRoute.output.parse(await invokeDaemonRoute(modelsSetStatusRoute.name, input));
    }

    case modelsAddCustomRoute.name: {
      const input = modelsAddCustomRoute.input.parse(rawInput);
      return modelsAddCustomRoute.output.parse(await invokeDaemonRoute(modelsAddCustomRoute.name, input));
    }

    case modelsRemoveCustomRoute.name: {
      const input = modelsRemoveCustomRoute.input.parse(rawInput);
      return modelsRemoveCustomRoute.output.parse(await invokeDaemonRoute(modelsRemoveCustomRoute.name, input));
    }

    case modelsUpdateCustomRoute.name: {
      const input = modelsUpdateCustomRoute.input.parse(rawInput);
      return modelsUpdateCustomRoute.output.parse(await invokeDaemonRoute(modelsUpdateCustomRoute.name, input));
    }

    case modelsGetConfigRoute.name: {
      const input = modelsGetConfigRoute.input.parse(rawInput);
      return modelsGetConfigRoute.output.parse(await invokeDaemonRoute(modelsGetConfigRoute.name, input));
    }

    case modelsSetConfigRoute.name: {
      const input = modelsSetConfigRoute.input.parse(rawInput);
      return modelsSetConfigRoute.output.parse(await invokeDaemonRoute(modelsSetConfigRoute.name, input));
    }

    case modelsResetConfigRoute.name: {
      const input = modelsResetConfigRoute.input.parse(rawInput);
      return modelsResetConfigRoute.output.parse(await invokeDaemonRoute(modelsResetConfigRoute.name, input));
    }

    case modelsGetProviderConfigsRoute.name: {
      const input = modelsGetProviderConfigsRoute.input.parse(rawInput);
      return modelsGetProviderConfigsRoute.output.parse(
        await invokeDaemonRoute(modelsGetProviderConfigsRoute.name, input),
      );
    }

    case modelsHasUserConfigRoute.name: {
      const input = modelsHasUserConfigRoute.input.parse(rawInput);
      return modelsHasUserConfigRoute.output.parse(await invokeDaemonRoute(modelsHasUserConfigRoute.name, input));
    }

    case modelsExportConfigsRoute.name: {
      modelsExportConfigsRoute.input.parse(rawInput);
      return modelsExportConfigsRoute.output.parse(await invokeDaemonRoute(modelsExportConfigsRoute.name, {}));
    }

    case modelsImportConfigsRoute.name: {
      const input = modelsImportConfigsRoute.input.parse(rawInput);
      return modelsImportConfigsRoute.output.parse(await invokeDaemonRoute(modelsImportConfigsRoute.name, input));
    }

    case modelsGetCapabilitiesRoute.name: {
      const input = modelsGetCapabilitiesRoute.input.parse(rawInput);
      return modelsGetCapabilitiesRoute.output.parse(await invokeDaemonRoute(modelsGetCapabilitiesRoute.name, input));
    }

    case modelsTranscribeAudioRoute.name: {
      const input = modelsTranscribeAudioRoute.input.parse(rawInput);
      return modelsTranscribeAudioRoute.output.parse({
        text: await llmProviderPresenter.transcribeAudioStandalone(
          input.providerId,
          input.modelId,
          input.audioBase64,
          input.mimeType,
          input.filename,
        ),
      });
    }

    default:
      return undefined;
  }
}
