export type {
  AiSdkProviderKind,
  CreateAiSdkProviderContextParams,
  AiSdkProviderContext,
  NormalizedAzureBaseUrl,
} from "@argos/backend-core/provider/aiSdk";

export {
  createAiSdkProviderContext,
  normalizeVertexRequestBody,
  normalizeGeminiBaseUrl,
  normalizeOllamaSdkHost,
  normalizeOllamaOpenAIBaseUrl,
  normalizeAnthropicBaseUrl,
  normalizeVertexBaseUrl,
  normalizeAzureBaseUrl,
} from "@argos/backend-core/provider/aiSdk";

import { createAiSdkProviderContext as createAiSdkProviderContextImpl } from "@argos/backend-core/provider/aiSdk";
import { proxyConfig } from "../../proxyConfig";

export function createAiSdkProviderContextWithProxy(
  params: Omit<import("@argos/backend-core/provider/aiSdk").CreateAiSdkProviderContextParams, "proxyUrl">,
) {
  return createAiSdkProviderContextImpl({
    ...params,
    proxyUrl: proxyConfig.getProxyUrl() ?? undefined,
  });
}
