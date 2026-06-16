import type { MCPToolDefinition } from "@shared/presenter";

export type ToolSource = "mcp" | "agent";

export interface ToolMapping {
  toolName: string;
  source: ToolSource;
  originalName?: string;
}

export class ToolMapper {
  private toolNameToSource = new Map<string, ToolSource>();
  private toolMappings: ToolMapping[] = [];

  registerTool(toolName: string, source: ToolSource, originalName?: string): void {
    this.toolNameToSource.set(toolName, source);
    this.toolMappings.push({
      toolName,
      source,
      originalName: originalName || toolName,
    });
  }

  registerTools(tools: MCPToolDefinition[], source: ToolSource): void {
    for (const tool of tools) {
      this.registerTool(tool.function.name, source);
    }
  }

  getToolSource(toolName: string): ToolSource | undefined {
    return this.toolNameToSource.get(toolName);
  }

  hasTool(toolName: string): boolean {
    return this.toolNameToSource.has(toolName);
  }

  clear(): void {
    this.toolNameToSource.clear();
    this.toolMappings = [];
  }

  getAllMappings(): ToolMapping[] {
    return [...this.toolMappings];
  }

  resolveDuplicate(toolName: string, preferredSource?: ToolSource): ToolSource {
    const existing = this.toolNameToSource.get(toolName);
    if (existing && preferredSource && existing !== preferredSource) {
      return preferredSource;
    }
    return existing || "mcp";
  }
}
