import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const RagflowKnowledgeSearchArgsSchema = z.object({
  query: z.string().describe("搜索查询内容 (必填)"),
  topK: z.number().optional().default(5).describe("返回结果数量 (默认5条)"),
  scoreThreshold: z.number().optional().default(0.2).describe("相似度阈值 (0-1之间，默认0.2)"),
  keyword: z.boolean().optional().default(false).describe("是否启用关键词匹配 (默认false)"),
  highlight: z.boolean().optional().default(false).describe("是否高亮匹配的文本 (默认false)"),
});

// Data structure returned by the RAGFlow API
interface RagflowSearchResponse {
  code: number;
  data: {
    chunks: Array<{
      content: string;
      content_ltks: string;
      document_id: string;
      document_keyword: string;
      highlight?: string;
      id: string;
      image_id: string;
      important_keywords: string[];
      kb_id: string;
      positions: string[];
      similarity: number;
      term_similarity: number;
      vector_similarity: number;
    }>;
    doc_aggs: Array<{
      count: number;
      doc_id: string;
      doc_name: string;
    }>;
    total: number;
  };
}

// Import the MCPTextContent interface
import { MCPTextContent } from "@shared/presenter";

export class RagflowKnowledgeServer {
  private server: Server;
  private configs: Array<{
    apiKey: string;
    endpoint: string;
    datasetIds: string[];
    description: string;
    enabled: boolean;
  }> = [];

  constructor(env?: Record<string, unknown>) {
    if (!env) {
      throw new Error("需要提供RAGFlow知识库配置");
    }

    const envs = env.configs;

    if (!Array.isArray(envs) || envs.length === 0) {
      throw new Error("需要提供至少一个RAGFlow知识库配置");
    }

    // Process each config
    for (const env of envs) {
      const config = env && typeof env === "object" ? (env as Record<string, unknown>) : {};
      const apiKey = String(config.apiKey ?? "");
      const datasetIds = Array.isArray(config.datasetIds)
        ? config.datasetIds.map((datasetId) => String(datasetId ?? "")).filter(Boolean)
        : [];
      const description = String(config.description ?? "");
      const endpoint = String(config.endpoint ?? "") || "http://localhost:8000";

      if (!apiKey) {
        throw new Error("需要提供RAGFlow API Key");
      }
      if (datasetIds.length === 0) {
        throw new Error("需要提供至少一个RAGFlow Dataset ID");
      }
      if (!description) {
        throw new Error("需要提供对这个知识库的描述，以方便ai决定是否检索此知识库");
      }

      this.configs.push({
        apiKey,
        datasetIds,
        endpoint,
        description,
        enabled: config.enabled === true || String(config.enabled ?? "").toLowerCase() === "true",
      });
    }

    // Create the server instance
    this.server = new Server(
      {
        name: "argos-inmemory/ragflow-knowledge-server",
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
            name: `ragflow_knowledge_search${suffix}`,
            description: config.description,
            inputSchema: zodToJsonSchema(RagflowKnowledgeSearchArgsSchema),
            annotations: {
              title: "RAGFlow Knowledge Search",
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

      // Check whether this is a RAGFlow knowledge-base search tool
      if (name.startsWith("ragflow_knowledge_search")) {
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

          return await this.performRagflowKnowledgeSearch(parameters, actualConfigIndex);
        } catch (error) {
          console.error("RAGFlow知识库搜索失败:", error);
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

  // Perform a RAGFlow knowledge-base search
  private async performRagflowKnowledgeSearch(
    parameters: Record<string, unknown> | undefined,
    configIndex: number = 0,
  ): Promise<{ content: MCPTextContent[] }> {
    const {
      query,
      topK = 5,
      scoreThreshold = 0.2,
      keyword = false,
      highlight = false,
    } = parameters as {
      query: string;
      topK?: number;
      scoreThreshold?: number;
      keyword?: boolean;
      highlight?: boolean;
    };

    if (!query) {
      throw new Error("查询内容不能为空");
    }

    // Get the active config
    const config = this.configs[configIndex];

    try {
      const url = `${config.endpoint.replace(/\/$/, "")}/api/v1/retrieval`;
      console.log("performRagflowKnowledgeSearch request", url, {
        question: query,
        dataset_ids: config.datasetIds,
        top_k: topK,
        similarity_threshold: scoreThreshold,
        keyword,
        highlight,
      });

      const response = await axios.post<RagflowSearchResponse>(
        url,
        {
          question: query,
          dataset_ids: config.datasetIds,
          page_size: topK,
          similarity_threshold: scoreThreshold,
          keyword,
          highlight,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
      );

      if (response.data.code !== 0) {
        throw new Error(`RAGFlow API错误: ${response.data.code}`);
      }

      // Process the response data
      const results = response.data.data.chunks.map((chunk) => {
        const docName = chunk.document_keyword || "未知文档";
        const docId = chunk.document_id;
        const content = highlight && chunk.highlight ? chunk.highlight : chunk.content;
        const score = chunk.similarity;

        return {
          title: docName,
          documentId: docId,
          content: content,
          score: score,
          keywords: chunk.important_keywords || [],
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
      console.error("RAGFlow API请求失败:", error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`RAGFlow API错误 (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
