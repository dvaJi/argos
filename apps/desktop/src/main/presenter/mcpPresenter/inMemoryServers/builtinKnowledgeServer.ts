import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { BuiltinKnowledgeConfig, MCPTextContent, QueryResult } from "@shared/presenter";
import { presenter } from "@/presenter";

// Schema definitions
const BuiltinKnowledgeSearchArgsSchema = z.object({
  query: z.string().describe("Search query content (required)"),
  topK: z.number().optional().default(5).describe("Number of results to return (default 5)"),
});

export class BuiltinKnowledgeServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "argos-inmemory/builtin-knowledge-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.setupRequestHandlers();
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const enabledConfigs = this.getEnabledConfigs();
      const tools = enabledConfigs.map((config, index) => {
        const suffix = enabledConfigs.length > 1 ? `_${index + 1}` : "";
        return {
          name: `builtin_knowledge_search${suffix}`,
          description: config.description,
          inputSchema: zodToJsonSchema(BuiltinKnowledgeSearchArgsSchema),
          annotations: {
            title: "Builtin Knowledge Search",
            readOnlyHint: true,
          },
        };
      });
      return { tools };
    });
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: parameters } = request.params;
      if (name.startsWith("builtin_knowledge_search")) {
        try {
          const enabledConfigs = this.getEnabledConfigs();
          let configIndex = 0;
          const match = name.match(/_([0-9]+)$/);
          if (match) {
            configIndex = parseInt(match[1], 10) - 1;
          }
          if (configIndex < 0 || configIndex >= enabledConfigs.length) {
            throw new Error(`Invalid knowledge base index: ${configIndex}`);
          }
          return await this.performBuiltinKnowledgeSearch(parameters, enabledConfigs[configIndex]);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
      };
    });
  }

  private getEnabledConfigs(): BuiltinKnowledgeConfig[] {
    return presenter.configPresenter.getKnowledgeConfigs().filter((config) => config.enabled);
  }

  private async performBuiltinKnowledgeSearch(
    parameters: Record<string, unknown> | undefined,
    config: BuiltinKnowledgeConfig,
  ): Promise<{ content: MCPTextContent[] }> {
    const { query } = parameters as { query: string; topK?: number };
    if (!query) {
      throw new Error("Query content cannot be empty");
    }
    try {
      const id = config.id;
      // similarityQuery(id, key)
      const results = await presenter.knowledgePresenter.similarityQuery(id, query);
      let resultText = `### Query: ${query}\n\n`;
      if (!results || results.length === 0) {
        resultText += "No matching results found.";
      } else {
        resultText += `Found ${results.length} relevant results:\n\n`;
        results.forEach((result: QueryResult, index: number) => {
          resultText += `#### ${index + 1}. (ID: ${result.id})\n`;
          resultText += `${result.metadata.content || ""}\n\n`;
          if (result.metadata.filePath) {
            resultText += `File: ${result.metadata.filePath}\n`;
          }
          resultText += `Similarity: ${1 - result.distance}\n\n`;
        });
      }
      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
}
