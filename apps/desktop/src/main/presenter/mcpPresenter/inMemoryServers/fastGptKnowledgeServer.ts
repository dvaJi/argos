import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const FastGptKnowledgeSearchArgsSchema = z.object({
  query: z.string().describe("Search query content (required)"),
  topK: z.number().optional().default(5).describe("Number of results to return (default 5)"),
  scoreThreshold: z.number().optional().default(0.2).describe("Similarity threshold (0-1, default 0.2)"),
});

// Data structure returned by the FastGPT API
interface FastGptSearchResponse {
  code: number;
  statusText: string;
  data: {
    list: Array<{
      id: string;
      q: string;
      a: string;
      datasetId: string;
      collectionId: string;
      sourceName: string;
      sourceId: string;
      score: Array<{
        value: number;
        type: string;
        index: number;
      }>;
    }>;
  };
}

// Import the MCPTextContent interface
import { MCPTextContent } from "@shared/presenter";

export class FastGptKnowledgeServer {
  private server: Server;
  private configs: Array<{
    apiKey: string;
    endpoint: string;
    datasetId: string;
    description: string;
    enabled: boolean;
  }> = [];

  constructor(env?: Record<string, unknown>) {
    if (!env) {
      throw new Error("FastGPT knowledge base configuration is required");
    }

    const envs = env.configs;

    if (!Array.isArray(envs) || envs.length === 0) {
      throw new Error("At least one FastGPT knowledge base configuration is required");
    }

    // Process each config
    for (const env of envs) {
      const config = env && typeof env === "object" ? (env as Record<string, unknown>) : {};
      const apiKey = String(config.apiKey ?? "");
      const datasetId = String(config.datasetId ?? "");
      const description = String(config.description ?? "");
      const endpoint = String(config.endpoint ?? "") || "http://localhost:3000/api";

      if (!apiKey) {
        throw new Error("FastGPT API Key is required");
      }
      if (!datasetId) {
        throw new Error("FastGPT Dataset ID is required");
      }
      if (!description) {
        throw new Error("A description for this knowledge base is required so the AI can decide whether to retrieve from it");
      }

      this.configs.push({
        apiKey,
        datasetId,
        endpoint,
        description,
        enabled: config.enabled === true || String(config.enabled ?? "").toLowerCase() === "true",
      });
    }

    // Create the server instance
    this.server = new Server(
      {
        name: "argos-inmemory/fastgpt-knowledge-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Set up request handlers
    this.setupRequestHandlers();
  }

  // Start the server
  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  // Set up request handlers
  private setupRequestHandlers(): void {
    // Register the tools-list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.configs
        .filter((conf) => conf.enabled)
        .map((config, index) => {
          const suffix = this.configs.length > 1 ? `_${index + 1}` : "";
          return {
            name: `fastgpt_knowledge_search${suffix}`,
            description: config.description,
            inputSchema: zodToJsonSchema(FastGptKnowledgeSearchArgsSchema),
            annotations: {
              title: "FastGPT Knowledge Search",
              readOnlyHint: true,
              openWorldHint: true,
            },
          };
        });
      return { tools };
    });

    // Register the tool-call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: parameters } = request.params;

      // Check whether this is a FastGPT knowledge-base search tool
      if (name.startsWith("fastgpt_knowledge_search")) {
        try {
          // Filter to enabled configs
          const enabledConfigs = this.configs.filter((config) => config.enabled);
          // Extract the index
          let configIndex = 0;
          const match = name.match(/_([0-9]+)$/);
          if (match) {
            configIndex = parseInt(match[1], 10) - 1;
          }

          // Ensure the index is valid
          if (configIndex < 0 || configIndex >= enabledConfigs.length) {
            throw new Error(`Invalid knowledge base index: ${configIndex}`);
          }
          // Resolve the actual config index
          const actualConfigIndex = this.configs.findIndex((config) => config === enabledConfigs[configIndex]);

          return await this.performFastGptKnowledgeSearch(parameters, actualConfigIndex);
        } catch (error) {
          console.error("FastGPT knowledge base search failed:", error);
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

  // Perform a FastGPT knowledge-base search
  private async performFastGptKnowledgeSearch(
    parameters: Record<string, unknown> | undefined,
    configIndex: number = 0,
  ): Promise<{ content: MCPTextContent[] }> {
    const {
      query,
      topK = 5,
      scoreThreshold = 0.2,
    } = parameters as {
      query: string;
      topK?: number;
      scoreThreshold?: number;
    };

    if (!query) {
      throw new Error("Query content cannot be empty");
    }

    // Get the active config
    const config = this.configs[configIndex];

    try {
      const url = `${config.endpoint.replace(/\/$/, "")}/core/dataset/searchTest`;

      const response = await axios.post<FastGptSearchResponse>(
        url,
        {
          datasetId: config.datasetId,
          text: query,
          limit: 20000,
          similarity: scoreThreshold,
          searchMode: "embedding",
          usingReRank: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
      );

      if (response.data.code !== 200) {
        throw new Error(`FastGPT API error: ${response.data.statusText}`);
      }

      // Process the response data
      const results = response.data.data.list.slice(0, topK).map((record) => {
        return {
          title: record.sourceName || "Unknown document",
          documentId: record.sourceId,
          content: record.q,
          score: record.score.length > 0 ? record.score[0].value : 0,
        };
      });

      // Build the response
      let resultText = `### Query: ${query}\n\n`;

      if (results.length === 0) {
        resultText += "No matching results found.";
      } else {
        resultText += `Found ${results.length} relevant results:\n\n`;

        results.forEach((result, index) => {
          resultText += `#### ${index + 1}. ${result.title} (relevance: ${(result.score * 100).toFixed(2)}%)\n`;
          resultText += `${result.content}\n\n`;
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
      console.error("FastGPT API request failed:", error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`FastGPT API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
