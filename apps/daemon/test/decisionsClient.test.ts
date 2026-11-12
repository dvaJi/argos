import { afterEach, describe, expect, it } from "bun:test";
import {
  DecisionsApiError,
  createOpenRouterDecisionsClient,
  isOpenRouterDecisionsBaseUrl,
  parseDecisionsResponse,
} from "@argos/backend-core";

const validResponse = {
  id: "gen-dec-1",
  model: "typesafe/jev-1.14",
  provider: "TypeSafe",
  answers: {
    keep_memory: { type: "noul", noul: 0.91, confidence: 0.95 },
    action: {
      type: "choice",
      choice: "update",
      probabilities: { update: 0.8, add: 0.1 },
      confidence: 0.85,
    },
    maybe: { type: "refusal" },
  },
  usage: { input_tokens: 42, output_tokens: 0, cost: 0.00002 },
};

describe("createOpenRouterDecisionsClient", () => {
  const realFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];

  afterEach(() => {
    globalThis.fetch = realFetch;
    fetchCalls.length = 0;
  });

  function stubFetch(handler: (call: { url: string; init: RequestInit }) => Response | Promise<Response>) {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} };
      fetchCalls.push(call);
      return await handler(call);
    }) as unknown as typeof fetch;
  }

  it("posts the typed questions with bearer auth and the session id", async () => {
    stubFetch(() => new Response(JSON.stringify(validResponse), { status: 200 }));
    const client = createOpenRouterDecisionsClient({ apiKey: "sk-or-test", sessionId: "agent-9" });

    const response = await client.ask({
      model: "typesafe/jev-1.14",
      state: { span: "hello" },
      questions: { keep_memory: { type: "noul", instructions: "keep?" } },
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://openrouter.ai/api/alpha/decisions");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as Record<string, unknown>;
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(body.state).toEqual({ span: "hello" });
    expect(body.session_id).toBe("agent-9");

    expect(response.answers.keep_memory).toEqual({ type: "noul", noul: 0.91, confidence: 0.95 });
    expect(response.answers.action).toEqual({
      type: "choice",
      choice: "update",
      probabilities: { update: 0.8, add: 0.1 },
      confidence: 0.85,
    });
    expect(response.answers.maybe).toEqual({ type: "refusal" });
    expect(response.usage).toEqual({ inputTokens: 42, outputTokens: 0, cost: 0.00002 });
  });

  it("does not retry non-retryable status codes", async () => {
    stubFetch(() => new Response("bad request", { status: 400 }));
    const client = createOpenRouterDecisionsClient({ apiKey: "k", timeoutMs: 250 });

    await expect(client.ask({ model: "m", state: "s", questions: { q: { type: "noul" } } })).rejects.toMatchObject({
      name: "DecisionsApiError",
      status: 400,
    });
    expect(fetchCalls).toHaveLength(1);
  });

  it("retries retryable status codes once and succeeds", async () => {
    stubFetch(() => {
      if (fetchCalls.length === 1) {
        return new Response("overloaded", { status: 503 });
      }
      return new Response(JSON.stringify(validResponse), { status: 200 });
    });
    const client = createOpenRouterDecisionsClient({ apiKey: "k", timeoutMs: 250 });

    const response = await client.ask({ model: "m", state: "s", questions: { q: { type: "noul" } } });
    expect(response.answers.keep_memory).toEqual({ type: "noul", noul: 0.91, confidence: 0.95 });
    expect(fetchCalls).toHaveLength(2);
  });

  it("gives up after one retry on repeated failures", async () => {
    stubFetch(() => new Response("still down", { status: 502 }));
    const client = createOpenRouterDecisionsClient({ apiKey: "k", timeoutMs: 250 });

    await expect(client.ask({ model: "m", state: "s", questions: { q: { type: "noul" } } })).rejects.toBeInstanceOf(
      DecisionsApiError,
    );
    expect(fetchCalls).toHaveLength(2);
  });

  it("aborts when the endpoint exceeds the timeout", async () => {
    stubFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new Error("aborted")), 250);
        }),
    );
    const client = createOpenRouterDecisionsClient({ apiKey: "k", timeoutMs: 20 });

    await expect(client.ask({ model: "m", state: "s", questions: { q: { type: "noul" } } })).rejects.toBeInstanceOf(
      DecisionsApiError,
    );
  });

  it("accepts a custom endpoint URL (tests, proxies)", async () => {
    stubFetch(() => new Response(JSON.stringify(validResponse), { status: 200 }));
    const client = createOpenRouterDecisionsClient({
      apiKey: "k",
      endpointUrl: "https://decisions.test/api/alpha/decisions",
      timeoutMs: 250,
    });
    await client.ask({ model: "m", state: "s", questions: { q: { type: "noul" } } });
    expect(fetchCalls[0].url).toBe("https://decisions.test/api/alpha/decisions");
  });
});

describe("parseDecisionsResponse", () => {
  it("throws on structurally broken payloads", () => {
    expect(() => parseDecisionsResponse(null)).toThrow(DecisionsApiError);
    expect(() => parseDecisionsResponse({})).toThrow(DecisionsApiError);
    expect(() => parseDecisionsResponse({ answers: null })).toThrow(DecisionsApiError);
  });

  it("drops unknown answer shapes instead of failing the whole response", () => {
    const parsed = parseDecisionsResponse({
      id: "x",
      answers: { weird: { type: "matter" }, score: { type: "score", score: 1.5 } },
      usage: {},
    });
    expect(parsed.answers.weird).toBeUndefined();
    expect(parsed.answers.score).toEqual({ type: "score", score: 1.5 });
    expect(parsed.usage).toEqual({ inputTokens: 0, outputTokens: 0, cost: undefined });
  });
});

describe("isOpenRouterDecisionsBaseUrl", () => {
  it("accepts the real openrouter.ai host", () => {
    expect(isOpenRouterDecisionsBaseUrl("https://openrouter.ai/api/v1/")).toBe(true);
    expect(isOpenRouterDecisionsBaseUrl("https://openrouter.ai/api")).toBe(true);
  });

  it("rejects proxies, other hosts, and malformed URLs", () => {
    expect(isOpenRouterDecisionsBaseUrl("https://proxy.example.com/v1/")).toBe(false);
    expect(isOpenRouterDecisionsBaseUrl("https://openrouter.ai.evil.example/v1")).toBe(false);
    expect(isOpenRouterDecisionsBaseUrl("")).toBe(false);
    expect(isOpenRouterDecisionsBaseUrl(undefined)).toBe(false);
    expect(isOpenRouterDecisionsBaseUrl("not a url")).toBe(false);
  });
});
