import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toJSONSchema, z } from "zod";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const DifyKnowledgeSearchArgsSchema = z.object({
  query: z.string().describe("Search query content (required)"),
  topK: z.number().optional().default(5).describe("Number of results to return (default 5)"),
  scoreThreshold: z.number().optional().default(0.2).describe("Similarity threshold (0-1, default 0.2)"),
});

// Data structure returned by the Dify API
interface DifySearchResponse {
  query: {
    content: string;
  };
  records: Array<{
    segment: {
      id: string;
      position: number;
      document_id: string;
      content: string;
      word_count: number;
      tokens: number;
      keywords: string[];
      index_node_id: string;
      index_node_hash: string;
      hit_count: number;
      enabled: boolean;
      status: string;
      created_by: string;
      created_at: number;
      indexing_at: number;
      completed_at: number;
      document?: {
        id: string;
        data_source_type: string;
        name: string;
      };
    };
    score: number;
  }>;
}

// Import the MCPTextContent interface
import { MCPTextContent } from "@shared/presenter";

export class DifyKnowledgeServer {
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
      throw new Error("Dify knowledge base configuration is required");
    }

    const envs = env.configs;

    if (!Array.isArray(envs) || envs.length === 0) {
      throw new Error("At least one Dify knowledge base configuration is required");
    }

    // Process each config
    for (const env of envs) {
      const config = env && typeof env === "object" ? (env as Record<string, unknown>) : {};
      const apiKey = String(config.apiKey ?? "");
      const datasetId = String(config.datasetId ?? "");
      const description = String(config.description ?? "");
      const endpoint = String(config.endpoint ?? "") || "https://api.dify.ai/v1";

      if (!apiKey) {
        throw new Error("Dify API Key is required");
      }
      if (!datasetId) {
        throw new Error("Dify Dataset ID is required");
      }
      if (!description) {
        throw new Error(
          "A description for this knowledge base is required so the AI can decide whether to retrieve from it",
        );
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
        name: "argos-inmemory/dify-knowledge-server",
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
            name: `dify_knowledge_search${suffix}`,
            description: config.description,
            inputSchema: toJSONSchema(DifyKnowledgeSearchArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Dify Knowledge Search",
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

      // Check whether this is a Dify knowledge-base search tool
      if (name.startsWith("dify_knowledge_search")) {
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

          return await this.performDifyKnowledgeSearch(parameters, actualConfigIndex);
        } catch (error) {
          console.error("Dify knowledge base search failed:", error);
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

  // Perform a Dify knowledge-base search
  private async performDifyKnowledgeSearch(
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
      const url = `${config.endpoint.replace(/\/$/, "")}/datasets/${config.datasetId}/retrieve`;

      // The newer Dify API folds retrieval settings into a retrieval_model object with two requirements:
      // 1. search_method is required (missing it fails parameter validation);
      // 2. reranking_enable / score_threshold_enabled must be booleans; passing null (legacy) is no longer accepted.
      // Default to semantic_search with rerank disabled, so retrieval does not depend on a configured Rerank model.
      // This works for any dataset; threshold filtering keeps the previous "no filtering" behaviour so the result set stays unchanged.
      const retrievalModel = {
        search_method: "semantic_search",
        reranking_enable: false,
        top_k: topK,
        score_threshold_enabled: false,
        score_threshold: null,
      };

      console.log("performDifyKnowledgeSearch request", url, {
        query,
        score_threshold: scoreThreshold,
        retrieval_model: retrievalModel,
      });

      const response = await axios.post<DifySearchResponse>(
        url,
        {
          query,
          retrieval_model: retrievalModel,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
      );

      // Process the response data
      const results = response.data.records.map((record) => {
        const docName = record.segment.document?.name || "Unknown document";
        const docId = record.segment.document_id;
        const content = record.segment.content;
        const score = record.score;

        return {
          title: docName,
          documentId: docId,
          content: content,
          score: score,
          keywords: record.segment.keywords || [],
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

          if (result.keywords && result.keywords.length > 0) {
            resultText += `Keywords: ${result.keywords.join(", ")}\n\n`;
          }
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
      console.error("Dify API request failed:", error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Dify API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
