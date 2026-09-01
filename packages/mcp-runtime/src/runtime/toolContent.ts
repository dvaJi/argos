import type { MCPToolResponse } from "@argos/shared/presenter";

/**
 * Formats a raw MCP tool response into the flat string the LLM consumes.
 *
 * Shared by the desktop McpPresenter and the daemon MCP runtime so both
 * `mcp.callTool` transports return the same `{ content, rawData }` shape —
 * keeping this in one place prevents the two hosts from drifting apart.
 */
export function formatToolCallContent(result: MCPToolResponse): string {
  let formattedContent = "";

  if (typeof result.content === "string") {
    // Content is already a string
    formattedContent = result.content;
  } else if (Array.isArray(result.content)) {
    // Content is structured array, needs formatting
    const contentParts: string[] = [];

    for (const item of result.content) {
      if (item.type === "text") {
        contentParts.push(item.text);
      } else if (item.type === "image") {
        contentParts.push(`[Image: ${item.mimeType}]`);
      } else if (item.type === "resource") {
        if ("text" in item.resource && item.resource.text) {
          contentParts.push(`[Resource: ${item.resource.uri}]\n${item.resource.text}`);
        } else if ("blob" in item.resource) {
          contentParts.push(`[Binary Resource: ${item.resource.uri}]`);
        } else {
          contentParts.push(`[Resource: ${item.resource.uri}]`);
        }
      } else {
        // Handle other unknown types
        contentParts.push(JSON.stringify(item));
      }
    }

    formattedContent = contentParts.join("\n\n");
  }

  // Add error marker (if any)
  if (result.isError) {
    formattedContent = `Error: ${formattedContent}`;
  }

  return formattedContent;
}
