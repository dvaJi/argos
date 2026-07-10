import zod from "zod";

// ---------- Zod Schemas ----------

// Capability sub-schemas
export const REASONING_EFFORT_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const ReasoningEffortSchema = zod.enum(REASONING_EFFORT_VALUES);
export type ReasoningEffort = zod.infer<typeof ReasoningEffortSchema>;
export const DEFAULT_REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ["minimal", "low", "medium", "high"];

export const VerbositySchema = zod.enum(["low", "medium", "high"]);
export type Verbosity = zod.infer<typeof VerbositySchema>;

export const ReasoningModeSchema = zod.enum(["budget", "effort", "level", "fixed", "mixed"]);
export type ReasoningMode = zod.infer<typeof ReasoningModeSchema>;

export const REASONING_VISIBILITY_VALUES = ["hidden", "summary", "full", "mixed", "omitted", "summarized"] as const;
export const ANTHROPIC_REASONING_VISIBILITY_VALUES = ["omitted", "summarized"] as const;
export const ReasoningVisibilitySchema = zod.enum(REASONING_VISIBILITY_VALUES);
export type ReasoningVisibility = zod.infer<typeof ReasoningVisibilitySchema>;
export type AnthropicReasoningVisibility = (typeof ANTHROPIC_REASONING_VISIBILITY_VALUES)[number];

export const ReasoningSchema = zod
  .object({
    supported: zod.boolean().optional(),
    default: zod.boolean().optional(),
    budget: zod
      .object({
        default: zod.number().int().optional(),
        min: zod.number().int().optional(),
        max: zod.number().int().optional(),
      })
      .optional(),
    effort: ReasoningEffortSchema.optional(),
    verbosity: VerbositySchema.optional(),
  })
  .optional();

export const ReasoningBudgetSchema = zod
  .object({
    default: zod.number().int().optional(),
    min: zod.number().int().optional(),
    max: zod.number().int().optional(),
    auto: zod.number().int().optional(),
    off: zod.number().int().optional(),
    unit: zod.string().optional(),
  })
  .optional();

export const ExtraReasoningSchema = zod
  .object({
    supported: zod.boolean().optional(),
    default_enabled: zod.boolean().optional(),
    mode: ReasoningModeSchema.optional(),
    budget: ReasoningBudgetSchema,
    effort: ReasoningEffortSchema.optional(),
    effort_options: zod.array(ReasoningEffortSchema).optional(),
    verbosity: VerbositySchema.optional(),
    verbosity_options: zod.array(VerbositySchema).optional(),
    level: zod.string().optional(),
    level_options: zod.array(zod.string()).optional(),
    interleaved: zod.boolean().optional(),
    summaries: zod.boolean().optional(),
    visibility: ReasoningVisibilitySchema.optional(),
    continuation: zod.array(zod.string()).optional(),
    notes: zod.array(zod.string()).optional(),
  })
  .optional();

export const ExtraCapabilitiesSchema = zod
  .object({
    reasoning: ExtraReasoningSchema,
  })
  .optional();

export const SearchSchema = zod
  .object({
    supported: zod.boolean().optional(),
    default: zod.boolean().optional(),
    forced_search: zod.boolean().optional(),
    search_strategy: zod.string().optional(),
  })
  .optional();

export const ModelSchema = zod.object({
  id: zod.string().min(1),
  name: zod.string().optional(),
  display_name: zod.string().optional(),
  modalities: zod
    .object({
      input: zod.array(zod.string()).optional(),
      output: zod.array(zod.string()).optional(),
    })
    .optional(),
  limit: zod
    .object({
      context: zod.number().int().nonnegative().optional(),
      output: zod.number().int().nonnegative().optional(),
    })
    .optional(),
  temperature: zod.boolean().optional(),
  tool_call: zod.boolean().optional(),
  reasoning: ReasoningSchema,
  extra_capabilities: ExtraCapabilitiesSchema,
  search: SearchSchema,
  attachment: zod.boolean().optional(),
  open_weights: zod.boolean().optional(),
  knowledge: zod.string().optional(),
  release_date: zod.string().optional(),
  last_updated: zod.string().optional(),
  cost: zod.record(zod.string(), zod.union([zod.string(), zod.number()])).optional(),
  type: zod.enum(["chat", "embedding", "rerank", "imageGeneration", "videoGeneration", "tts"]).optional(),
});

export type ProviderModel = zod.infer<typeof ModelSchema>;

export const ProviderSchema = zod.object({
  id: zod.string().min(1),
  name: zod.string().optional(),
  display_name: zod.string().optional(),
  api: zod.string().optional(),
  doc: zod.string().optional(),
  env: zod.array(zod.string()).optional(),
  models: zod.array(ModelSchema),
});

export type ProviderEntry = zod.infer<typeof ProviderSchema>;

export const ProviderAggregateSchema = zod.object({
  providers: zod.record(zod.string(), ProviderSchema),
});

export type ProviderAggregate = zod.infer<typeof ProviderAggregateSchema>;

export type ReasoningPortrait = {
  supported?: boolean;
  defaultEnabled?: boolean;
  mode?: ReasoningMode;
  budget?: {
    default?: number;
    min?: number;
    max?: number;
    auto?: number;
    off?: number;
    unit?: string;
  };
  effort?: ReasoningEffort;
  effortOptions?: ReasoningEffort[];
  verbosity?: Verbosity;
  verbosityOptions?: Verbosity[];
  level?: string;
  levelOptions?: string[];
  interleaved?: boolean;
  summaries?: boolean;
  visibility?: ReasoningVisibility;
  continuation?: string[];
  notes?: string[];
};

export type ReasoningControlMode = "unsupported" | "toggle" | "indicator";

export const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  ReasoningEffortSchema.safeParse(value).success;

export const isVerbosity = (value: unknown): value is Verbosity => VerbositySchema.safeParse(value).success;

export const isReasoningVisibility = (value: unknown): value is ReasoningVisibility =>
  ReasoningVisibilitySchema.safeParse(value).success;

export const normalizeReasoningVisibilityValue = (value: unknown): ReasoningVisibility | undefined => {
  return isReasoningVisibility(value) ? value : undefined;
};

export const normalizeAnthropicReasoningVisibilityValue = (
  value: unknown,
): AnthropicReasoningVisibility | undefined => {
  switch (value) {
    case "hidden":
    case "omitted":
      return "omitted";
    case "summary":
    case "summarized":
      return "summarized";
    default:
      return undefined;
  }
};

const canResolveReasoningEffortFromPortrait = (portrait: ReasoningPortrait | null | undefined): boolean =>
  portrait?.mode !== "budget" && portrait?.mode !== "level" && portrait?.mode !== "mixed";

export const normalizeReasoningEffortValue = (
  portrait: ReasoningPortrait | null | undefined,
  value: unknown,
): ReasoningEffort | undefined => {
  if (!isReasoningEffort(value)) {
    return undefined;
  }

  const options = portrait?.effortOptions?.filter(isReasoningEffort);
  if (options && options.length > 0) {
    if (options.includes(value)) {
      return value;
    }

    return isReasoningEffort(portrait?.effort) && options.includes(portrait.effort) ? portrait.effort : undefined;
  }

  if (canResolveReasoningEffortFromPortrait(portrait) && isReasoningEffort(portrait?.effort)) {
    return value === portrait.effort ? value : portrait.effort;
  }

  return value;
};

export const supportsReasoningCapability = (portrait: ReasoningPortrait | null | undefined): boolean =>
  portrait?.supported === true;

export const getReasoningControlMode = (portrait: ReasoningPortrait | null | undefined): ReasoningControlMode => {
  if (!supportsReasoningCapability(portrait)) {
    return "unsupported";
  }

  return portrait?.mode === undefined || portrait.mode === "budget" ? "toggle" : "indicator";
};

export const hasAnthropicReasoningToggle = (
  providerId: string | null | undefined,
  portrait: ReasoningPortrait | null | undefined,
): boolean =>
  providerId?.trim().toLowerCase() === "anthropic" &&
  supportsReasoningCapability(portrait) &&
  portrait?.mode === "effort";

export const getReasoningControlModeForProvider = (
  providerId: string | null | undefined,
  portrait: ReasoningPortrait | null | undefined,
): ReasoningControlMode => {
  if (hasAnthropicReasoningToggle(providerId, portrait)) {
    return "toggle";
  }

  return getReasoningControlMode(portrait);
};

export const hasIndependentReasoningToggle = (portrait: ReasoningPortrait | null | undefined): boolean =>
  getReasoningControlMode(portrait) === "toggle";

export const hasIndependentReasoningToggleForProvider = (
  providerId: string | null | undefined,
  portrait: ReasoningPortrait | null | undefined,
): boolean => getReasoningControlModeForProvider(providerId, portrait) === "toggle";

export const getReasoningEffectiveEnabled = (
  portrait: ReasoningPortrait | null | undefined,
  state: {
    reasoning?: boolean | null;
    reasoningEffort?: unknown;
  } = {},
): boolean => {
  if (!portrait) {
    return state.reasoning === true;
  }

  if (!supportsReasoningCapability(portrait)) {
    return false;
  }

  if (hasIndependentReasoningToggle(portrait)) {
    return state.reasoning ?? portrait.defaultEnabled ?? true;
  }

  if (canResolveReasoningEffortFromPortrait(portrait)) {
    const resolvedEffort =
      normalizeReasoningEffortValue(portrait, state.reasoningEffort) ??
      normalizeReasoningEffortValue(portrait, portrait.effort);
    if (resolvedEffort === "none") {
      return false;
    }

    if (resolvedEffort !== undefined) {
      return true;
    }
  }

  return portrait.defaultEnabled ?? true;
};

export const getReasoningEffectiveEnabledForProvider = (
  providerId: string | null | undefined,
  portrait: ReasoningPortrait | null | undefined,
  state: {
    reasoning?: boolean | null;
    reasoningEffort?: unknown;
  } = {},
): boolean => {
  if (hasAnthropicReasoningToggle(providerId, portrait)) {
    return state.reasoning ?? portrait?.defaultEnabled ?? true;
  }

  return getReasoningEffectiveEnabled(portrait, state);
};

// ---------- Helpers ----------

export function isImageInputSupported(model: ProviderModel | undefined): boolean {
  if (!model || !model.modalities || !model.modalities.input) return false;
  return model.modalities.input.includes("image");
}

// strengthened id check: lowercase and allowed chars
const PROVIDER_ID_REGEX = /^[a-z0-9][a-z0-9-_]*$/;
const MODEL_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-_.:/]*$/;
export function isValidLowercaseProviderId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id === id.toLowerCase() && PROVIDER_ID_REGEX.test(id);
}
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && MODEL_ID_REGEX.test(id);
}

// Sanitize an unknown aggregate object: filter out invalid providers/models
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}
function getBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  return typeof v === "boolean" ? v : undefined;
}
function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function getStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  const arr = v.filter((x) => typeof x === "string") as string[];
  return arr.length ? arr : [];
}
function getStringNumberRecord(obj: unknown): Record<string, string | number> | undefined {
  if (!isRecord(obj)) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

type ModelTypeValue = "chat" | "embedding" | "rerank" | "imageGeneration" | "videoGeneration" | "tts";

function getEffortValue(v: unknown): ReasoningEffort | undefined {
  return isReasoningEffort(v) ? v : undefined;
}

function getVerbosityValue(v: unknown): Verbosity | undefined {
  return isVerbosity(v) ? v : undefined;
}

function getReasoningModeValue(v: unknown): ReasoningMode | undefined {
  const parsed = ReasoningModeSchema.safeParse(v);
  return parsed.success ? parsed.data : undefined;
}

function getReasoningVisibilityValue(v: unknown): ReasoningVisibility | undefined {
  const parsed = ReasoningVisibilitySchema.safeParse(v);
  return parsed.success ? parsed.data : undefined;
}

function getNonEmptyStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const values = getStringArray(obj, key);
  return values && values.length > 0 ? values : undefined;
}

function getOptionalStringArray(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item) => typeof item === "string" && item.trim()) as string[];
  return values.length > 0 ? values : undefined;
}

function getReasoningBudget(obj: unknown):
  | {
      default?: number;
      min?: number;
      max?: number;
      auto?: number;
      off?: number;
      unit?: string;
    }
  | undefined {
  if (!isRecord(obj)) return undefined;

  const budget: {
    default?: number;
    min?: number;
    max?: number;
    auto?: number;
    off?: number;
    unit?: string;
  } = {};

  const def = getNumber(obj, "default");
  const min = getNumber(obj, "min");
  const max = getNumber(obj, "max");
  const auto = getNumber(obj, "auto");
  const off = getNumber(obj, "off");
  const unit = getString(obj, "unit");

  if (typeof def === "number") budget.default = def;
  if (typeof min === "number") budget.min = min;
  if (typeof max === "number") budget.max = max;
  if (typeof auto === "number") budget.auto = auto;
  if (typeof off === "number") budget.off = off;
  if (unit) budget.unit = unit;

  return Object.keys(budget).length > 0 ? budget : undefined;
}

function getModelTypeValue(v: unknown): ModelTypeValue | undefined {
  if (typeof v !== "string") return undefined;

  // First try exact match (for standard format)
  switch (v) {
    case "chat":
    case "embedding":
    case "rerank":
    case "imageGeneration":
    case "videoGeneration":
    case "tts":
      return v;
  }

  // Normalize and handle variants (like image_generation, image-generation, etc.)
  const normalized = v.toLowerCase().replace(/[_-]/g, "");
  switch (normalized) {
    case "chat":
      return "chat";
    case "embedding":
      return "embedding";
    case "rerank":
      return "rerank";
    case "imagegeneration":
    case "imagegen":
      return "imageGeneration";
    case "videogeneration":
    case "videogen":
    case "video":
      return "videoGeneration";
    case "tts":
      return "tts";
    default:
      return undefined;
  }
}

function getReasoning(obj: unknown): ProviderModel["reasoning"] {
  if (typeof obj === "boolean") {
    return { supported: obj };
  }
  if (!isRecord(obj)) return undefined;
  const supported = getBoolean(obj, "supported");
  const defEnabled = getBoolean(obj, "default");
  const rawBudget = getReasoningBudget((obj as Record<string, unknown>)["budget"]);
  const budget =
    rawBudget && (rawBudget.default !== undefined || rawBudget.min !== undefined || rawBudget.max !== undefined)
      ? {
          ...(rawBudget.default !== undefined ? { default: rawBudget.default } : {}),
          ...(rawBudget.min !== undefined ? { min: rawBudget.min } : {}),
          ...(rawBudget.max !== undefined ? { max: rawBudget.max } : {}),
        }
      : undefined;
  const effort = getEffortValue((obj as any)["effort"]);
  const verbosity = getVerbosityValue((obj as any)["verbosity"]);

  if (
    supported !== undefined ||
    defEnabled !== undefined ||
    budget !== undefined ||
    effort !== undefined ||
    verbosity !== undefined
  )
    return { supported, default: defEnabled, budget, effort, verbosity };
  return undefined;
}

function getExtraReasoning(obj: unknown): NonNullable<ProviderModel["extra_capabilities"]>["reasoning"] {
  if (!isRecord(obj)) return undefined;

  const supported = getBoolean(obj, "supported");
  const default_enabled = getBoolean(obj, "default_enabled");
  const mode = getReasoningModeValue(obj["mode"]);
  const budget = getReasoningBudget(obj["budget"]);
  const effort = getEffortValue(obj["effort"]);
  const effort_options = getNonEmptyStringArray(obj, "effort_options")?.filter(
    (value) => ReasoningEffortSchema.safeParse(value).success,
  ) as ReasoningEffort[] | undefined;
  const verbosity = getVerbosityValue(obj["verbosity"]);
  const verbosity_options = getNonEmptyStringArray(obj, "verbosity_options")?.filter(
    (value) => VerbositySchema.safeParse(value).success,
  ) as Verbosity[] | undefined;
  const level = getString(obj, "level");
  const level_options = getNonEmptyStringArray(obj, "level_options");
  const interleaved = getBoolean(obj, "interleaved");
  const summaries = getBoolean(obj, "summaries");
  const visibility = getReasoningVisibilityValue(obj["visibility"]);
  const continuation = getOptionalStringArray(obj["continuation"]);
  const notes = getOptionalStringArray(obj["notes"]);

  if (
    supported !== undefined ||
    default_enabled !== undefined ||
    mode !== undefined ||
    budget !== undefined ||
    effort !== undefined ||
    effort_options !== undefined ||
    verbosity !== undefined ||
    verbosity_options !== undefined ||
    level !== undefined ||
    level_options !== undefined ||
    interleaved !== undefined ||
    summaries !== undefined ||
    visibility !== undefined ||
    continuation !== undefined ||
    notes !== undefined
  ) {
    return {
      supported,
      default_enabled,
      mode,
      budget,
      effort,
      effort_options,
      verbosity,
      verbosity_options,
      level,
      level_options,
      interleaved,
      summaries,
      visibility,
      continuation,
      notes,
    };
  }

  return undefined;
}

function getExtraCapabilities(obj: unknown): ProviderModel["extra_capabilities"] {
  if (!isRecord(obj)) return undefined;
  const reasoning = getExtraReasoning(obj["reasoning"]);
  if (reasoning) {
    return { reasoning };
  }
  return undefined;
}

function getSearch(obj: unknown): ProviderModel["search"] {
  if (!isRecord(obj)) return undefined;
  const supported = getBoolean(obj, "supported");
  const defEnabled = getBoolean(obj, "default");
  const forced_search = getBoolean(obj, "forced_search");
  const search_strategy = getString(obj, "search_strategy");
  if (
    supported !== undefined ||
    defEnabled !== undefined ||
    forced_search !== undefined ||
    search_strategy !== undefined
  ) {
    return { supported, default: defEnabled, forced_search, search_strategy };
  }
  return undefined;
}

export function sanitizeAggregate(input: unknown): ProviderAggregate | null {
  if (!isRecord(input)) return null;
  const providersRaw = (input as Record<string, unknown>)["providers"];
  if (!isRecord(providersRaw)) return null;

  const sanitizedProviders: Record<string, ProviderEntry> = {};

  for (const [key, rawProviderVal] of Object.entries(providersRaw)) {
    if (!isRecord(rawProviderVal)) continue;
    const rawProvider = rawProviderVal as Record<string, unknown>;

    const pid = getString(rawProvider, "id") ?? key;
    if (!isValidLowercaseProviderId(pid)) continue;
    if (pid !== key) continue;

    const modelsVal = rawProvider["models"];
    if (!Array.isArray(modelsVal)) continue;

    const sanitizedModels: ProviderModel[] = [];
    for (const rmVal of modelsVal) {
      if (!isRecord(rmVal)) continue;
      const rm = rmVal as Record<string, unknown>;
      const mid = getString(rm, "id");
      if (!isValidModelId(mid)) continue;

      // limit
      let limit: ProviderModel["limit"] | undefined;
      const rlimit = rm["limit"];
      if (isRecord(rlimit)) {
        const ctx = getNumber(rlimit, "context");
        const out = getNumber(rlimit, "output");
        const lim: { context?: number; output?: number } = {};
        if (typeof ctx === "number" && ctx >= 0) lim.context = ctx;
        if (typeof out === "number" && out >= 0) lim.output = out;
        if (lim.context !== undefined || lim.output !== undefined) limit = lim;
      }

      // modalities
      let modalities: ProviderModel["modalities"] | undefined;
      const rmods = rm["modalities"];
      if (isRecord(rmods)) {
        const inp = getStringArray(rmods, "input");
        const out = getStringArray(rmods, "output");
        if (inp || out) modalities = { input: inp, output: out };
      }

      const model: ProviderModel = {
        id: mid!,
        name: getString(rm, "name"),
        display_name: getString(rm, "display_name"),
        modalities,
        limit,
        temperature: getBoolean(rm, "temperature"),
        tool_call: getBoolean(rm, "tool_call"),
        reasoning: getReasoning(rm["reasoning"]),
        extra_capabilities: getExtraCapabilities(rm["extra_capabilities"]),
        search: getSearch(rm["search"]),
        attachment: getBoolean(rm, "attachment"),
        open_weights: getBoolean(rm, "open_weights"),
        knowledge: getString(rm, "knowledge"),
        release_date: getString(rm, "release_date"),
        last_updated: getString(rm, "last_updated"),
        cost: getStringNumberRecord(rm["cost"]),
        type: getModelTypeValue(rm["type"]),
      };

      sanitizedModels.push(model);
    }

    if (sanitizedModels.length === 0) continue;

    const envArr = getStringArray(rawProvider, "env");

    const provider: ProviderEntry = {
      id: pid,
      name: getString(rawProvider, "name"),
      display_name: getString(rawProvider, "display_name"),
      api: getString(rawProvider, "api"),
      doc: getString(rawProvider, "doc"),
      env: envArr,
      models: sanitizedModels,
    };

    sanitizedProviders[pid] = provider;
  }

  const keys = Object.keys(sanitizedProviders);
  if (keys.length === 0) return null;
  return { providers: sanitizedProviders };
}
