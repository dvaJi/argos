import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const DifyKnowledgeSearchArgsSchema = z.object({
  query: z.string().describe("搜索查询内容 (必填)"),
  topK: z.number().optional().default(5).describe("返回结果数量 (默认5条)"),
  scoreThreshold: z.number().optional().default(0.2).describe("相似度阈值 (0-1之间，默认0.2)"),
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
      throw new Error("需要提供Dify知识库配置");
    }

    const envs = env.configs;

    if (!Array.isArray(envs) || envs.length === 0) {
      throw new Error("需要提供至少一个Dify知识库配置");
    }

    // Process each config
    for (const env of envs) {
      const config = env && typeof env === "object" ? (env as Record<string, unknown>) : {};
      const apiKey = String(config.apiKey ?? "");
      const datasetId = String(config.datasetId ?? "");
      const description = String(config.description ?? "");
      const endpoint = String(config.endpoint ?? "") || "https://api.dify.ai/v1";

      if (!apiKey) {
        throw new Error("需要提供Dify API Key");
      }
      if (!datasetId) {
        throw new Error("需要提供Dify Dataset ID");
      }
      if (!description) {
        throw new Error("需要提供对这个知识库的描述，以方便ai决定是否检索此知识库");
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
            inputSchema: zodToJsonSchema(DifyKnowledgeSearchArgsSchema),
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
            throw new Error(`无效的知识库索引: ${configIndex}`);
          }

          // Resolve the actual config index
          const actualConfigIndex = this.configs.findIndex((config) => config === enabledConfigs[configIndex]);

          return await this.performDifyKnowledgeSearch(parameters, actualConfigIndex);
        } catch (error) {
          console.error("Dify知识库搜索失败:", error);
          return {
            content: [
              {
                type: "text",
                text: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `未知工具: ${name}`,
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
      throw new Error("查询内容不能为空");
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
        const docName = record.segment.document?.name || "未知文档";
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
      let resultText = `### 查询: ${query}\n\n`;

      if (results.length === 0) {
        resultText += "未找到相关结果。";
      } else {
        resultText += `找到 ${results.length} 条相关结果:\n\n`;

        results.forEach((result, index) => {
          resultText += `#### ${index + 1}. ${result.title} (相关度: ${(result.score * 100).toFixed(2)}%)\n`;
          resultText += `${result.content}\n\n`;

          if (result.keywords && result.keywords.length > 0) {
            resultText += `关键词: ${result.keywords.join(", ")}\n\n`;
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
      console.error("Dify API请求失败:", error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Dify API错误 (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
