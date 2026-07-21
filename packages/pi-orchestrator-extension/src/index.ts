import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";

export interface ArgosOrchestratorBridge {
  tools: MCPToolDefinition[];
  call(toolCallId: string, toolName: string, input: Record<string, unknown>): Promise<MCPToolResponse>;
}

/**
 * Pi-native adapter for Argos orchestration. All authority remains in the
 * daemon: this extension only exposes its approved tool definitions to Pi.
 */
export function createArgosOrchestratorExtension(bridge: ArgosOrchestratorBridge): InlineExtension {
  return {
    name: "argos-orchestrator",
    factory: (pi) => {
      for (const tool of bridge.tools) {
        pi.registerTool(
          defineTool({
            name: tool.function.name,
            label: tool.function.name,
            description: tool.function.description,
            parameters: Type.Unsafe(tool.function.parameters),
            execute: async (toolCallId, input) => {
              const response = await bridge.call(toolCallId, tool.function.name, input as Record<string, unknown>);
              const content = Array.isArray(response.content)
                ? response.content.map((item: any) =>
                    item.type === "image"
                      ? { type: "image" as const, data: item.data, mimeType: item.mimeType }
                      : { type: "text" as const, text: item.text ?? JSON.stringify(item) },
                  )
                : [{ type: "text" as const, text: response.content }];
              return { content, details: response, isError: Boolean(response.isError) };
            },
          }),
        );
      }
    },
  };
}
