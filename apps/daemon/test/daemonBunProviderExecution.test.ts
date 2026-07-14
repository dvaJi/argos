import { describe, expect, it, vi } from "vitest";
import { BunProviderExecutionPort } from "../src/host/bun-provider-execution";

describe("BunProviderExecutionPort", () => {
  it("exposes the active generation without leaking its controller", () => {
    const port = new BunProviderExecutionPort({} as any, {} as any);
    (port as any).activeGenerations.set("session-1", {
      controller: new AbortController(),
      eventId: "event-1",
      runId: "run-1",
    });

    expect(port.getActiveGeneration("session-1")).toEqual({ eventId: "event-1", runId: "run-1" });
    expect(port.getActiveGeneration("missing")).toBeNull();
  });

  it("transcribes audio through the provider API", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("model")).toBe("gpt-4o-transcribe");
      return new Response(JSON.stringify({ text: "transcribed text" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const port = new BunProviderExecutionPort(
      {
        getProviders: () => [
          {
            id: "openai",
            apiType: "openai-compatible",
            apiKey: "secret",
            baseUrl: "https://api.example.com/v1",
            enable: true,
          },
        ],
      } as any,
      {
        get: vi.fn(),
      } as any,
    );

    await expect(port.transcribeAudio("openai", "gpt-4o-transcribe", "AQID", "audio/wav", "audio.wav")).resolves.toBe(
      "transcribed text",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/audio/transcriptions");
  });
});
