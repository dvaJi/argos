import { afterEach, describe, expect, it, vi } from "vitest";
import { AcpContentMapper } from "@argos/acp-runtime";

const SESSION_ID = "acp-session";

function notify(kind: "tool_call" | "tool_call_update", update: Record<string, unknown>) {
  return { sessionId: SESSION_ID, update: { sessionUpdate: kind, ...update } } as any;
}

function toolCallEndArgs(mapper: AcpContentMapper, id: string): string | undefined {
  const mapped = mapper.map(notify("tool_call_update", { toolCallId: id, status: "completed" })) as any;
  const end = mapped.events.find((e: any) => e.type === "tool_call_end");
  return end?.tool_call_arguments_complete as string | undefined;
}

describe("AcpContentMapper tool call arguments", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it("replaces the arguments buffer when rawInput snapshots are re-emitted on updates", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper();
    const id = "exec-0b7c5743";
    const placeholder = { type: "webSearch", id, query: "", action: null };
    const realInput = { type: "webSearch", id, query: "react compiler", action: null };

    mapper.map(notify("tool_call", { toolCallId: id, title: "Search the web", rawInput: placeholder }));
    mapper.map(
      notify("tool_call_update", {
        toolCallId: id,
        title: "Search the web",
        status: "in_progress",
        rawInput: realInput,
      }),
    );

    const args = toolCallEndArgs(mapper, id);
    expect(args).toBe(JSON.stringify(realInput));
    expect(JSON.parse(args ?? "")).toEqual(realInput);
    // No "arguments appear incomplete" warning for snapshot sequences.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps captured rawInput when a later update carries only a title", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper();
    const id = "exec-5";
    const input = { type: "webSearch", id, query: "react compiler", action: null };

    mapper.map(notify("tool_call", { toolCallId: id, title: "Searching", rawInput: input }));
    mapper.map(notify("tool_call_update", { toolCallId: id, title: "Searching the web for results" }));

    const args = toolCallEndArgs(mapper, id);
    expect(args).toBe(JSON.stringify(input));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps captured rawInput when a later update carries only locations", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper();
    const id = "exec-6";
    const input = { type: "read_file", id, path: "package.json" };

    mapper.map(notify("tool_call", { toolCallId: id, title: "Reading file", rawInput: input }));
    mapper.map(
      notify("tool_call_update", {
        toolCallId: id,
        title: "Reading file",
        locations: [{ uri: "file:///package.json" }],
      }),
    );

    const args = toolCallEndArgs(mapper, id);
    expect(args).toBe(JSON.stringify(input));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("salvages the last complete JSON document from a concatenated snapshot buffer", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper() as unknown as {
      tryParseJsonArguments(buffer: string, toolCallId: string): string | undefined;
    };
    const first = '{"type":"webSearch","id":"exec-1","query":"","action":null}';
    const second = '{"type":"webSearch","id":"exec-1","query":"react compiler","action":null}';

    const args = mapper.tryParseJsonArguments(`${first}${second}`, "exec-1");
    expect(args).toBe(second);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns instead of salvaging nested fragments from a truncated buffer", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper() as unknown as {
      tryParseJsonArguments(buffer: string, toolCallId: string): string | undefined;
    };
    const truncated = '{"q":"v","m":{"a":1}';

    const args = mapper.tryParseJsonArguments(truncated, "exec-7");
    expect(args).toBe(truncated);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns and passes the buffer through only when nothing salvageable remains", () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mapper = new AcpContentMapper() as unknown as {
      tryParseJsonArguments(buffer: string, toolCallId: string): string | undefined;
    };
    const broken = '{"query":"unterminated';

    const args = mapper.tryParseJsonArguments(broken, "exec-2");
    expect(args).toBe(broken);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("still appends streamed content text fallback chunks", () => {
    const mapper = new AcpContentMapper();
    const id = "exec-3";
    const textContent = (text: string) => [{ type: "content", content: { type: "text", text } }];

    mapper.map(notify("tool_call", { toolCallId: id, content: textContent("hello") }));
    mapper.map(notify("tool_call_update", { toolCallId: id, content: textContent(" world") }));

    expect(toolCallEndArgs(mapper, id)).toBe("hello world");
  });

  it("replaces the params chunk when consecutive title-only updates arrive", () => {
    const mapper = new AcpContentMapper();
    const id = "exec-4";

    mapper.map(notify("tool_call", { toolCallId: id, title: "Searching the web" }));
    mapper.map(notify("tool_call_update", { toolCallId: id, title: "Searching the web for 'react compiler'" }));

    expect(toolCallEndArgs(mapper, id)).toBe("Searching the web for 'react compiler'");
  });
});
