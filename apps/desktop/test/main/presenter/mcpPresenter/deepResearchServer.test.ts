import { describe, expect, it, vi, beforeEach } from "vitest";
import { Server } from "@argos/mcp-runtime";
import { CallToolRequestSchema } from "@argos/mcp-runtime";
import { DeepResearchServer } from "@argos/mcp-runtime";

const serverInstances = vi.hoisted(() => [] as Array<{ handlers: Map<unknown, Function> }>);

vi.mock("@modelcontextprotocol/server", () => ({
  Server: vi.fn<(...args: any[]) => any>(),
}));

describe("DeepResearchServer", () => {
  beforeEach(() => {
    serverInstances.length = 0;
    (
      Server as unknown as {
        mockImplementation: (factory: () => unknown) => void;
      }
    ).mockImplementation(function () {
      const instance = {
        handlers: new Map<unknown, Function>(),
        connect: vi.fn<(...args: any[]) => any>(),
        setRequestHandler: vi.fn<(...args: any[]) => any>((method: unknown, _schemas: unknown, handler: Function) => {
          instance.handlers.set(method, handler);
        }),
      };
      serverInstances.push(instance);
      return instance;
    });
  });

  it("uses the injected locale in the final documentation prompt", async () => {
    new DeepResearchServer({ BOCHA_API_KEY: "secret" }, { getLanguage: () => "fr-FR" });
    const callHandler = serverInstances[0].handlers.get("tools/call");

    const startResult = await callHandler?.({
      name: "start_deep_research",
      arguments: { question: "What is Argos?" },
    });
    const sessionId = JSON.parse(startResult.content[0].text).session_id as string;

    const finalResult = await callHandler?.({
      name: "generate_final_answer",
      arguments: { session_id: sessionId },
    });

    const payload = JSON.parse(finalResult.content[0].text);
    expect(payload.documentation_instructions).toContain("fr-FR");
  });
});
