/**
 * JSON-RPC protocol error codes and error class for MCP protocol errors.
 *
 * These are protocol-level errors (JSON-RPC responses), not SDK/transport
 * errors. Both 1.x and v2 use the same JSON-RPC error code numbering.
 * Defined locally so mcp-runtime doesn't depend on either SDK version.
 */
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

/** JSON-RPC protocol error with a numeric code (compatible with 1.x McpError). */
export class McpError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
