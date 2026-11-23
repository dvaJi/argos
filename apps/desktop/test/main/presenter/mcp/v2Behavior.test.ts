import { describe, it, expect } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Server } from "@modelcontextprotocol/server";
import { ToolsCallParamsSchema, ToolsListParamsSchema } from "@argos/mcp-runtime";

/**
 * Behavioral verification of the v2 packages on a REAL in-memory v2
 * connection (Client 2.4.0 ↔ Server 2.4.0 over InMemoryTransport):
 *
 * 1. Round-trip: the migrated 3-arg server registrations + v2 client
 *    convenience methods interoperate end to end (tools/list + tools/call).
 * 2. structuredContent round-trips on matching output schemas.
 * 3. Ajv strictness: a tool result whose structuredContent does not match the
 *    declared outputSchema is rejected by the client-side validator.
 *
 * Note: v2 negotiates the `legacy` protocol era by default, so the 2026-07-28
 * era deltas (structuredContent $ref-rooted unwrapping, x-mcp-header
 * body-derived headers) are dormant unless a connection opts into
 * `mode: "auto"` — they are not exercised here.
 */
describe("MCP v2 behavioral verification (live in-memory connection)", () => {
  async function createLinkedPair(overrides?: { outputSchema?: unknown; structuredContent?: unknown }) {
    const server = new Server({ name: "test-v2-server", version: "1.0.0" }, { capabilities: { tools: {} } });
    const client = new Client({ name: "test-v2-client", version: "1.0.0" });

    server.setRequestHandler("tools/list", { params: ToolsListParamsSchema }, async () => ({
      tools: [
        {
          name: "echo",
          description: "Echoes the input",
          inputSchema: { type: "object", properties: { value: { type: "string" } } },
          ...(overrides?.outputSchema ? { outputSchema: overrides.outputSchema } : {}),
        },
      ],
    }));
    server.setRequestHandler("tools/call", { params: ToolsCallParamsSchema }, async (request) => {
      void request;
      return {
        content: [{ type: "text", text: "echo!" }],
        ...(overrides?.structuredContent !== undefined ? { structuredContent: overrides.structuredContent } : {}),
        isError: false,
      };
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client };
  }

  it("round-trips tools/list and tools/call through the v2 connection", async () => {
    const { client } = await createLinkedPair();

    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(1);
    expect(tools.tools[0].name).toBe("echo");

    const result = await client.callTool({ name: "echo", arguments: { value: "hi" } });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "echo!" }]);
  });

  it("passes structuredContent through when it matches the declared outputSchema", async () => {
    const outputSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    };
    const { client } = await createLinkedPair({
      outputSchema,
      structuredContent: { value: "hi" },
    });
    await client.listTools();

    const result = await client.callTool({ name: "echo", arguments: {} });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ value: "hi" });
  });

  it("rejects structuredContent that violates the declared outputSchema (Ajv strictness)", async () => {
    const outputSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    };
    const { client } = await createLinkedPair({
      outputSchema,
      structuredContent: { value: 42 },
    });
    await client.listTools();

    await expect(client.callTool({ name: "echo", arguments: {} })).rejects.toThrow(/invalid|schema|failed/i);
  });
});
