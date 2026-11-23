/**
 * JSON-RPC protocol error codes and error class for MCP protocol errors.
 *
 * These are protocol-level errors (JSON-RPC error responses), not
 * SDK/transport errors. The numbering is identical across MCP SDK 1.x and
 * v2 — v2 exposes it as `ProtocolErrorCode` plus the `ProtocolError` class
 * (both re-exported here under the 1.x names so the rest of the codebase
 * and downstream packages keep their imports stable).
 */
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ResourceNotFound: -32002,
  /** 1.x-defined server-range code, kept for the elicitation-abort path. */
  RequestTimeout: -32001,
} as const;

export { ProtocolError as McpError } from "@modelcontextprotocol/client";
