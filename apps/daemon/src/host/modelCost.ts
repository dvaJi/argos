import type { ProviderAggregate } from "@argos/shared/types/model-db";

/** Numeric coercion for provider cost fields (numbers or numeric strings). */
export function costNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Resolve per-MTok pricing for a provider/model from the daemon provider DB
 * catalog. Returns undefined when the provider/model has no usable cost data.
 */
export function resolveModelCost(
  configPresenter: unknown,
  providerId: string,
  modelId: string,
): { input: number; output: number; cacheRead: number; cacheWrite: number } | undefined {
  try {
    const catalog = (
      configPresenter as {
        getDaemonProviderDb?: () => { catalog: ProviderAggregate | null };
      }
    ).getDaemonProviderDb?.()?.catalog;
    const provider = catalog?.providers?.[providerId];
    const model = provider?.models?.find((item) => item.id === modelId);
    if (!model?.cost) return undefined;
    const input = costNumber(model.cost["input"]);
    const output = costNumber(model.cost["output"]);
    if (input === undefined || output === undefined) return undefined;
    return {
      input,
      output,
      cacheRead: costNumber(model.cost["cache_read"]) ?? input,
      cacheWrite: costNumber(model.cost["cache_write"]) ?? input,
    };
  } catch {
    return undefined;
  }
}
