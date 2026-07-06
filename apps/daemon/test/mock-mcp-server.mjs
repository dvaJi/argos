#!/usr/bin/env node
/**
 * Minimal stdio MCP server mock for integration tests.
 *
 * Transport: NDJSON over stdio (one JSON object per line), matching
 * @modelcontextprotocol/sdk v1.29.0 StdioServerTransport format.
 *
 * Exposes a single "echo" tool that returns its input unchanged.
 * Responds to MCP protocol handshake and tool listing requests.
 */
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, terminal: false });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  // Ignore notifications (no id field)
  if (msg.id === undefined || msg.id === null) return;

  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: "mock-mcp-server", version: "0.0.1" },
      },
    });
  } else if (msg.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Echo the input text back",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string", description: "Text to echo" } },
              required: ["text"],
            },
          },
        ],
      },
    });
  } else if (msg.method === "tools/call") {
    const text = msg.params?.arguments?.text ?? "";
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text }] },
    });
  } else if (msg.method === "resources/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { resources: [] } });
  } else if (msg.method === "prompts/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { prompts: [] } });
  } else {
    // Unknown method — return method-not-found error
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: "Method not found" },
    });
  }
});

rl.on("close", () => process.exit(0));
