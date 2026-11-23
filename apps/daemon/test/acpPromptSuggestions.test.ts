import { describe, it, expect, vi } from "bun:test";
import { AcpProviderExecutionPort } from "../src/host/acp-provider-execution";

const createPort = () => {
  const publish = vi.fn();
  const port = new AcpProviderExecutionPort({} as never, {} as never, { publish } as never, {
    dataDir: "/tmp",
    appVersion: "1.0.0",
    toolchains: {} as never,
    db: { prepare: vi.fn() },
  });
  return { port, publish };
};

describe("ACP prompt suggestions", () => {
  it("publishes suggestions updates with session correlation", () => {
    const { port, publish } = createPort();

    (port as any).publishPromptSuggestions("conversation-1", "assistant-1", ["Review the diff", "Run the tests"]);

    expect(publish).toHaveBeenCalledTimes(1);
    const [name, payload] = publish.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("chat.promptSuggestions.updated");
    expect(payload).toMatchObject({
      sessionId: "conversation-1",
      messageId: "assistant-1",
      suggestions: ["Review the diff", "Run the tests"],
    });
    expect(typeof payload.updatedAt).toBe("number");
  });

  it("publishes empty lists as the withdrawal signal", () => {
    const { port, publish } = createPort();

    (port as any).publishPromptSuggestions("conversation-1", "assistant-1", []);

    const [, payload] = publish.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.suggestions).toEqual([]);
  });
});
