/**
 * OpenRouter Decisions API (`POST /api/alpha/decisions`) — typed questions
 * (`noul` / `choice` / `score`) answered with probabilities instead of
 * generated text.
 *
 * The API is **alpha** and its shape may change, so all request/response
 * knowledge is isolated in this module: hand-validated parsing, no SDK
 * dependency. See docs/features/decision-models.
 */

export type DecisionsQuestion =
  | {
      type: "noul";
      /** What the boolean condition means. */
      instructions?: string;
      /** Structured guidance for the `true` / `false` outcomes. */
      criteria?: { true?: string; false?: string };
    }
  | {
      type: "choice";
      instructions?: string;
      /** Option id → guidance. The response echoes the chosen option id. */
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions?: string;
      /** Ordered level descriptions, index = level. */
      criteria: string[];
    };

export interface DecisionsRequestInput {
  model: string;
  /** The content to evaluate: plain text or structured context. */
  state: string | Record<string, unknown> | unknown[];
  /** Question id → typed question. Answers come back keyed the same way. */
  questions: Record<string, DecisionsQuestion>;
  /** Observability grouping id (agent/session); never sent upstream by OpenRouter. */
  sessionId?: string;
  /** Provider routing preferences (e.g. refuse data-collecting endpoints). */
  providerPreferences?: { dataCollection?: "allow" | "deny" };
}

export type DecisionsAnswer =
  | { type: "noul"; noul: number; confidence?: number }
  | {
      type: "choice";
      choice: string;
      probabilities?: Record<string, number>;
      confidence?: number;
    }
  | {
      type: "score";
      score: number;
      probabilities?: Record<string, number>;
      confidence?: number;
      legend?: Record<string, string>;
    }
  | { type: "refusal" };

export type DecisionsAnswerMap = Record<string, DecisionsAnswer>;

export interface DecisionsUsage {
  inputTokens: number;
  outputTokens: number;
  /** What OpenRouter charged for the request, in credits (USD). */
  cost?: number;
}

export interface DecisionsResponse {
  id: string;
  model: string;
  provider?: string;
  answers: Record<string, DecisionsAnswer>;
  usage: DecisionsUsage;
}

export class DecisionsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DecisionsApiError";
    this.status = status;
  }
}

export interface OpenRouterDecisionsClientOptions {
  apiKey: string;
  /** Full decisions endpoint URL. Defaults to the OpenRouter alpha endpoint. */
  endpointUrl?: string;
  timeoutMs?: number;
  /** Default observability grouping id (agent/session) for every request. */
  sessionId?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export interface OpenRouterDecisionsClient {
  ask(input: Omit<DecisionsRequestInput, "sessionId"> & { sessionId?: string }): Promise<DecisionsResponse>;
}

const DEFAULT_ENDPOINT_URL = "https://openrouter.ai/api/alpha/decisions";
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 529]);
const RETRY_DELAY_MS = 400;

export const createOpenRouterDecisionsClient = (
  options: OpenRouterDecisionsClientOptions,
): OpenRouterDecisionsClient => {
  const endpointUrl = options.endpointUrl ?? DEFAULT_ENDPOINT_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  const askOnce = async (body: Record<string, unknown>, deadlineAt: number): Promise<DecisionsResponse> => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new DecisionsApiError("Decisions request timed out", 0);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response: Response;
    try {
      response = await doFetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      throw new DecisionsApiError(`Decisions request failed: ${message}`, 0);
    }

    // The deadline spans the response **body** read too: headers alone do not
    // end the budget, and some runtimes do not tie fetch aborts to body
    // reads — so the body read races the same shared deadline explicitly.
    let bodyTimer: ReturnType<typeof setTimeout> | undefined;
    const readBody = async (): Promise<DecisionsResponse> => {
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        throw new DecisionsApiError(`Decisions API error (${response.status}): ${detail}`, response.status);
      }
      return parseDecisionsResponse(await response.json().catch(() => null));
    };
    try {
      const result = await Promise.race([
        readBody(),
        new Promise<never>((_, reject) => {
          const ms = Math.max(deadlineAt - Date.now(), 0);
          bodyTimer = setTimeout(() => reject(new DecisionsApiError("Decisions request timed out", 0)), ms);
        }),
      ]);
      return result;
    } finally {
      clearTimeout(timer);
      if (bodyTimer) clearTimeout(bodyTimer);
      // Abandoned bodies (timeout path) must not hold the stream open.
      void response.body?.cancel().catch(() => {});
    }
  };

  return {
    async ask(input) {
      const body: Record<string, unknown> = {
        model: input.model,
        state: input.state,
        questions: input.questions,
      };
      const sessionId = input.sessionId ?? options.sessionId;
      if (sessionId) {
        body.session_id = sessionId.slice(0, 256);
      }
      if (input.providerPreferences?.dataCollection) {
        body.provider = { data_collection: input.providerPreferences.dataCollection };
      }

      const deadlineAt = Date.now() + timeoutMs;
      try {
        return await askOnce(body, deadlineAt);
      } catch (error) {
        const retryable = error instanceof DecisionsApiError && RETRYABLE_STATUSES.has(error.status);
        if (!retryable) {
          throw error;
        }
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) {
          throw error;
        }
        // Keep the retry inside the shared deadline: with tiny budgets the
        // backoff shrinks instead of eating the whole budget.
        await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_DELAY_MS, Math.floor(remaining / 4))));
        return askOnce(body, deadlineAt);
      }
    },
  };
};

/**
 * Defensively parse the alpha response. Unknown/invalid answer entries become
 * `refusal`; a structurally broken response throws so callers fall back.
 */
export const parseDecisionsResponse = (payload: unknown): DecisionsResponse => {
  if (!payload || typeof payload !== "object") {
    throw new DecisionsApiError("Decisions response is not an object", 0);
  }
  const obj = payload as Record<string, unknown>;
  const answersRaw = obj.answers;
  if (!answersRaw || typeof answersRaw !== "object") {
    throw new DecisionsApiError("Decisions response has no answers map", 0);
  }

  const answers: Record<string, DecisionsAnswer> = {};
  for (const [key, raw] of Object.entries(answersRaw as Record<string, unknown>)) {
    const parsed = parseDecisionsAnswer(raw);
    if (parsed) {
      answers[key] = parsed;
    }
  }

  const usageRaw = (obj.usage ?? {}) as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" ? obj.id : "",
    model: typeof obj.model === "string" ? obj.model : "",
    provider: typeof obj.provider === "string" ? obj.provider : undefined,
    answers,
    usage: {
      inputTokens: typeof usageRaw.input_tokens === "number" ? usageRaw.input_tokens : 0,
      outputTokens: typeof usageRaw.output_tokens === "number" ? usageRaw.output_tokens : 0,
      cost: typeof usageRaw.cost === "number" ? usageRaw.cost : undefined,
    },
  };
};

const parseDecisionsAnswer = (raw: unknown): DecisionsAnswer | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  switch (obj.type) {
    case "refusal":
      return { type: "refusal" };
    case "noul":
      return isUnitInterval(obj.noul)
        ? { type: "noul", noul: obj.noul, confidence: toConfidence(obj.confidence) }
        : undefined;
    case "choice":
      return typeof obj.choice === "string"
        ? {
            type: "choice",
            choice: obj.choice,
            probabilities: toNumberMap(obj.probabilities),
            confidence: toConfidence(obj.confidence),
          }
        : undefined;
    case "score":
      return typeof obj.score === "number"
        ? {
            type: "score",
            score: obj.score,
            probabilities: toNumberMap(obj.probabilities),
            confidence: toConfidence(obj.confidence),
            legend: toStringMap(obj.legend),
          }
        : undefined;
    default:
      return undefined;
  }
};

/** Probabilities and confidences outside [0, 1] are malformed — drop them. */
const isUnitInterval = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const toConfidence = (value: unknown): number | undefined => (isUnitInterval(value) ? value : undefined);

const toNumberMap = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isUnitInterval(entry)) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const toStringMap = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * True when the provider baseUrl host can serve the Decisions API. The
 * Decisions surface is OpenRouter-only, and providers must use the real
 * openrouter.ai host (not an OpenAI-compatible proxy).
 */
export const isOpenRouterDecisionsBaseUrl = (baseUrl: string | undefined): boolean => {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname === "openrouter.ai";
  } catch {
    return false;
  }
};
