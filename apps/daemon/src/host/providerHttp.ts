/**
 * OpenAI-compatible provider HTTP helpers shared by the daemon runtimes
 * (memory + knowledge). Providers come from the daemon config presenter
 * (single source of truth for API keys / base URLs).
 */

type ProviderRecord = { id: string; apiKey: string; baseUrl: string };

export type ProviderResolver = (providerId: string) => ProviderRecord;

export function createConfigProviderResolver(getProviders: () => unknown): ProviderResolver {
  return (providerId: string): ProviderRecord => {
    const providers = getProviders() as Array<ProviderRecord>;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider?.apiKey) throw new Error(`Provider ${providerId} not found or no API key`);
    if (!provider.baseUrl) throw new Error(`Provider ${providerId} has no baseUrl`);
    return provider;
  };
}

function embeddingsUrl(baseUrl: string): string {
  let base = baseUrl.replace(/\/+$/, "");
  if (!base.endsWith("/v1")) base += "/v1";
  return `${base}/embeddings`;
}

/** Generate embeddings via an OpenAI-compatible `/embeddings` endpoint. */
export async function fetchProviderEmbeddings(
  resolveProvider: ProviderResolver,
  providerId: string,
  modelId: string,
  texts: string[],
): Promise<number[][]> {
  const provider = resolveProvider(providerId);
  const response = await fetch(embeddingsUrl(provider.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: modelId, input: texts }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embeddings API error (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}
