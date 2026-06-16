// src/main/presenter/mcpPresenter/inMemoryServers/deepResearchServer.ts
// Main code adapted from https://github.com/pinkpixel-dev/deep-research-mcp
// Search engine replaced with Bocha; page content extraction logic rewritten.
// Uses a reflection-based incremental iterative research mode.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";
import { presenter } from "@/presenter";
import { nanoid } from "nanoid";

// === Schema definitions ===

// StartDeepResearchArgsSchema: Parameters for starting deep research.
const StartDeepResearchArgsSchema = z.object({
  question: z.string().describe("要开始深度研究的研究问题或主题。"),
});

// SingleWebSearchArgsSchema: Parameters for a single web search.
const SingleWebSearchArgsSchema = z.object({
  session_id: z.string().describe("来自 start_deep_research 的研究会话ID。"),
  query: z.string().describe("要执行的单个搜索查询。"),
  max_results: z.number().min(5).max(15).default(10).describe("此搜索查询的最大结果数 (5-15)。"),
});

// RequestResearchDataArgsSchema: Parameters for the LLM to request accumulated search results for reflection.
const RequestResearchDataArgsSchema = z.object({
  session_id: z.string().describe("研究会话ID。"),
  iteration: z.number().describe("当前研究迭代次数。LLM 应自行维护此数值并传入。"),
});

// SubmitReflectionResultsArgsSchema: Parameters for the LLM to submit reflection results.
const SubmitReflectionResultsArgsSchema = z.object({
  session_id: z.string().describe("研究会话ID。"),
  iteration: z.number().describe("此反思对应的迭代次数。"),
  needs_more_research: z.boolean().describe("LLM 分析后认为是否需要更多研究。"),
  missing_information: z.array(z.string()).describe("LLM 识别出的缺失信息列表，如果需要更多研究。"),
  quality_assessment: z.string().describe("LLM 对当前研究结果的质量评估。"),
  suggested_queries: z.array(z.string()).describe("LLM 基于当前信息和缺失点，建议的后续搜索查询。"),
  confidence_score: z.number().min(0).max(1).describe("LLM 对当前研究完整性和准确性的置信度（0-1 范围）。"),
});

// GenerateFinalAnswerArgsSchema: Parameters for generating the final research report.
const GenerateFinalAnswerArgsSchema = z.object({
  session_id: z.string().describe("来自 start_deep_research 的研究会话ID。"),
  documentation_prompt: z.string().optional().describe("自定义文档生成提示词。"),
});

// Default document generation prompt
const DEFAULT_DOCUMENTATION_PROMPT = `
对于所有查询，请广泛搜索网页以获取最新信息。研究多个来源。利用所有提供的工具来收集尽可能多的上下文。适当时包含截图。
创建文档时请遵循以下指导原则：
1. 内容质量：
  清晰、简洁且事实准确
  结构逻辑清晰
  主题覆盖全面
  技术精确，注重细节
  不含不必要的评论或幽默
2. 文档风格：
  专业客观的语气
  透彻的解释，技术深度适中
  格式良好，包含适当的标题、列表和代码块
  术语和命名约定保持一致
  布局整洁、易读，无多余元素
3. 代码质量：
  代码干净、可维护且注释良好
  遵循最佳实践和现代模式
  适当的错误处理和边缘情况考虑
  优化性能和效率
  遵循语言特定的风格指南
4. 技术专长：
  编程语言和框架
  系统架构和设计模式
  开发方法论和实践
  安全考虑和标准
  行业标准工具和技术
5. 文档要求：
  当被要求时，请围绕给定主题创建一份极其详细、全面的 Markdown 文档。
`;
// === Interface definitions ===

// ReflectionResult: Structure of reflection results submitted by the LLM to the server.
interface ReflectionResult {
  needs_more_research: boolean; // Whether more research is needed
  missing_information: string[]; // List of missing information
  quality_assessment: string; // Research quality assessment
  suggested_queries: string[]; // Suggested follow-up queries
  confidence_score: number; // Confidence score (0-1)
}

// SearchResult: Data structure for a single search result.
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published_date?: string;
}

// QuerySearchResult: Multiple search results for a single query.
interface QuerySearchResult {
  query: string;
  results: SearchResult[];
}

// ResearchSession: Data structure for a research session.
interface ResearchSession {
  session_id: string;
  question: string;
  iteration: number; // Session iteration count, maintained by the LLM and updated on reflection submission
  search_results: QuerySearchResult[]; // Stores all search queries and their results
  reflections: ReflectionResult[]; // Stores all reflection results submitted by the LLM
  suggested_queries: string[]; // Queries suggested by the LLM after the last reflection

  // last_reflected_search_index: Index into search_results that the LLM last processed during reflection.
  // Enables incremental data delivery; new data is provided starting after this index on the next request.
  last_reflected_search_index: number;

  created_at: Date;
  last_accessed_at: Date;
  is_completed: boolean; // Whether the session is completed and pending cleanup
}

// BochaWebSearchResponse: Response structure of the Bocha search engine API.
interface BochaWebSearchResponse {
  msg: string | null;
  data: {
    _type: string;
    queryContext: {
      originalQuery: string;
    };
    webPages: {
      webSearchUrl: string;
      totalEstimatedMatches: number;
      value: Array<{
        id: string | null;
        name: string;
        url: string;
        displayUrl: string;
        snippet: string;
        summary: string; // Summary provided by Bocha, used for result display
        siteName: string;
        siteIcon: string;
        dateLastCrawled: string;
        cachedPageUrl: string | null;
        language: string | null;
        isFamilyFriendly: boolean | null;
        isNavigational: boolean | null;
        datePublished?: string; // Publication date
      }>;
      isFamilyFriendly: boolean | null;
    };
    videos: unknown | null; // Video results, currently unused
  };
}

export class DeepResearchServer {
  private server: Server;
  private bochaApiKey: string;
  private researchSessions: Map<string, ResearchSession> = new Map();
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // Session timeout: 1 hour
  private readonly MAX_SESSIONS = 50; // Maximum concurrent sessions
  private cleanupTimer: NodeJS.Timeout | null = null; // Session cleanup timer

  constructor(env?: Record<string, unknown>) {
    // Check if the Bocha API key is provided
    const bochaApiKey = String(env?.BOCHA_API_KEY ?? "");
    if (!bochaApiKey) {
      throw new Error("需要 BOCHA_API_KEY");
    }
    this.bochaApiKey = bochaApiKey;

    this.server = new Server(
      {
        name: "argos-inmemory/deep-research-server",
        version: "2.0.0", // Version number
      },
      {
        capabilities: {
          tools: {}, // Declare tool capabilities
        },
      },
    );

    this.setupRequestHandlers(); // Set up request handlers
    this.startCleanupTimer(); // Start session cleanup timer
  }

  // Start the server and connect the transport layer
  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  // Start session cleanup timer to periodically clean up expired sessions
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpiredSessions();
      },
      5 * 60 * 1000, // Check every 5 minutes
    );
  }

  // Clean up expired research sessions
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.researchSessions.entries()) {
      if (now.getTime() - session.last_accessed_at.getTime() > this.SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach((sessionId) => {
      this.researchSessions.delete(sessionId);
      console.log(`已清理过期研究会话: ${sessionId}`);
    });

    // If the session count exceeds the limit, clean up the least recently accessed sessions
    if (this.researchSessions.size > this.MAX_SESSIONS) {
      const sortedSessions = Array.from(this.researchSessions.entries()).sort(
        ([, a], [, b]) => a.last_accessed_at.getTime() - b.last_accessed_at.getTime(),
      );

      const toRemove = sortedSessions.slice(0, this.researchSessions.size - this.MAX_SESSIONS);
      toRemove.forEach(([sessionId]) => {
        this.researchSessions.delete(sessionId);
        console.log(`因超限已清理旧研究会话: ${sessionId}`);
      });
    }
  }

  // Get the research session with the specified ID and update its last accessed time
  private getSession(sessionId: string): ResearchSession {
    const session = this.researchSessions.get(sessionId);
    if (!session) {
      throw new Error(`未找到研究会话: ${sessionId}`);
    }
    session.last_accessed_at = new Date(); // Update last accessed time
    return session;
  }

  // Create a new research session
  private createSession(question: string): ResearchSession {
    const sessionId = nanoid(); // Generate a unique session ID
    const session: ResearchSession = {
      session_id: sessionId,
      question,
      iteration: 0, // Initial iteration is 0
      search_results: [],
      reflections: [],
      suggested_queries: [], // Initial suggested queries are determined by the LLM
      last_reflected_search_index: -1, // Initially no results have been reflected on
      created_at: new Date(),
      last_accessed_at: new Date(),
      is_completed: false,
    };

    this.researchSessions.set(sessionId, session);
    return session;
  }

  // Clean up research session data for the specified ID
  private cleanupSession(sessionId: string): void {
    const removed = this.researchSessions.delete(sessionId);
    if (removed) {
      console.log(`研究会话已清理: ${sessionId}`);
    }
  }

  // Set up the server request handlers, defining tool list and tool call logic
  private setupRequestHandlers(): void {
    // Define the list of available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "start_deep_research",
            description: "启动一个新的深度研究会话。返回 session_id 用于后续操作。",
            inputSchema: zodToJsonSchema(StartDeepResearchArgsSchema),
            annotations: {
              title: "Start Deep Research",
              destructiveHint: false,
            },
          },
          {
            name: "execute_single_web_search",
            description: "在研究会话内执行一次网页搜索。",
            inputSchema: zodToJsonSchema(SingleWebSearchArgsSchema),
            annotations: {
              title: "Execute Web Search",
              readOnlyHint: false,
              openWorldHint: true,
            },
          },
          {
            name: "request_research_data",
            description: "请求当前会话中新增的搜索结果和研究背景，供 LLM 反思。",
            inputSchema: zodToJsonSchema(RequestResearchDataArgsSchema),
            annotations: {
              title: "Request Research Data",
              readOnlyHint: true,
            },
          },
          {
            name: "submit_reflection_results",
            description: "LLM 提交其对研究数据的反思结果（如是否需更多研究、建议查询等）。",
            inputSchema: zodToJsonSchema(SubmitReflectionResultsArgsSchema),
            annotations: {
              title: "Submit Reflection Results",
              destructiveHint: false,
            },
          },
          {
            name: "generate_final_answer",
            description: "根据累积研究生成最终答案，并清理会话数据。",
            inputSchema: zodToJsonSchema(GenerateFinalAnswerArgsSchema),
            annotations: {
              title: "Generate Final Answer",
              destructiveHint: true,
            },
          },
        ],
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "start_deep_research":
            return await this.handleStartDeepResearch(args);
          case "execute_single_web_search":
            return await this.handleSingleWebSearch(args);
          case "request_research_data": // Tool to request research data
            return await this.handleRequestResearchData(args);
          case "submit_reflection_results": // Tool to submit reflection results
            return await this.handleSubmitReflectionResults(args);
          case "generate_final_answer":
            return await this.handleGenerateFinalAnswer(args);
          default:
            throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        console.error("调用工具时出错:", error);
        const errorMessage =
          error instanceof Error ? error.message : typeof error === "string" ? error : "发生未知错误";

        return {
          content: [{ type: "text", text: `错误: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  // Handle start deep research request
  private async handleStartDeepResearch(args: unknown) {
    const parsed = StartDeepResearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`start_deep_research 参数无效: ${parsed.error}`);
    }
    const { question } = parsed.data;
    const session = this.createSession(question);

    // Optimization: return a concise response with session_id and next-step instructions
    const response = {
      session_id: session.session_id,
      next_steps: `研究会话已创建 (ID: ${session.session_id})。LLM 请生成初始搜索查询，并使用 execute_single_web_search 执行搜索。完成后调用 request_research_data 获取数据反思。`,
    };
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  }

  // Handle single web search request
  private async handleSingleWebSearch(args: unknown) {
    const parsed = SingleWebSearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`execute_single_web_search 参数无效: ${parsed.error}`);
    }
    const { session_id, query, max_results } = parsed.data;
    const session = this.getSession(session_id);

    try {
      const searchResult = await this.performSingleBochaSearch(query, max_results);
      session.search_results.push(searchResult); // Store search results

      // Optimization: return a concise response with result count and next-step instructions
      const response = {
        results_count: searchResult.results.length,
        next_steps: `搜索结果已存储。可继续搜索，或调用 request_research_data 获取数据反思。`,
      };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      const axiosError = error as { message?: string };
      console.error("单次网页搜索出错:", axiosError.message);
      throw new Error(`单次网页搜索失败: ${axiosError.message}`);
    }
  }

  // Handle request for research data (incremental delivery)
  private async handleRequestResearchData(args: unknown) {
    const parsed = RequestResearchDataArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`request_research_data 参数无效: ${parsed.error}`);
    }
    const { session_id } = parsed.data; // iteration is maintained by the LLM
    const session = this.getSession(session_id);

    // Compute and send new search results since the last reflection
    const startIndex = session.last_reflected_search_index + 1;
    const newSearchResults = session.search_results.slice(startIndex);

    const newConsolidatedResearchContent = newSearchResults
      .map(
        (sr) =>
          `=== 搜索查询: ${sr.query} ===\n` +
          sr.results
            .map(
              (result, idx) =>
                `[来源 ${idx + 1}] ${result.title}\n` +
                `URL: ${result.url}\n` +
                `发布日期: ${result.published_date || "未知"}\n` +
                `内容摘要: ${result.snippet}\n` + // Uses the summary provided by Bocha
                `---`,
            )
            .join("\n"),
      )
      .join("\n\n");

    // Optimization: return a concise response with only new results and reflection instructions
    const response = {
      new_search_results_to_reflect: newConsolidatedResearchContent, // Send only new search results
      reflection_instructions: `
你是一个严谨的研究分析师。你已收到一批新的搜索结果。
请将这些新增结果与你（LLM）已有的历史研究数据结合，对【整个累积的研究上下文】进行全面评估。
基于这些【整个累积研究上下文】信息，判断是否已充分回答研究问题：“${session.question}”。

你的任务是生成结构化的 JSON 结果，包含字段：
- needs_more_research: boolean (是否需更多研究)
- missing_information: string[] (若需更多研究，列出缺失信息)
- quality_assessment: string (当前研究质量评估)
- suggested_queries: string[] (若需更多研究，建议3-5个新查询)
- confidence_score: number (0-1，当前研究完整性与准确性的置信度)

请严格以 JSON 格式输出，不要包含任何额外解释。
`,
      next_steps: `LLM 请使用上述数据和指令进行反思，然后调用 submit_reflection_results 提交分析结果。`,
    };
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  }

  // Handle submit reflection results request
  private async handleSubmitReflectionResults(args: unknown) {
    const parsed = SubmitReflectionResultsArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`submit_reflection_results 参数无效: ${parsed.error}`);
    }
    const {
      session_id,
      iteration,
      needs_more_research,
      missing_information,
      quality_assessment,
      suggested_queries,
      confidence_score,
    } = parsed.data;
    const session = this.getSession(session_id);

    // Store the reflection results submitted by the LLM
    const reflection: ReflectionResult = {
      needs_more_research,
      missing_information,
      quality_assessment,
      suggested_queries,
      confidence_score,
    };
    session.reflections.push(reflection);
    session.iteration = iteration; // LLM updates the iteration count
    session.suggested_queries = suggested_queries || []; // Update suggested queries

    // Core: update last_reflected_search_index to mark that the LLM has processed all current search results
    // If search_results is empty (length 0), last_reflected_search_index is -1, which is correct.
    session.last_reflected_search_index = session.search_results.length - 1;

    // Optimization: return a concise response with only next-step instructions
    const nextStepsMessage = needs_more_research
      ? `LLM 分析表明需要更多研究。建议的后续查询已更新。LLM 请使用建议查询执行额外搜索。`
      : `LLM 分析表明已收集足够信息。LLM 请调用 generate_final_answer 生成最终报告。`;

    return {
      content: [{ type: "text", text: JSON.stringify({ next_steps: nextStepsMessage }, null, 2) }],
    };
  }

  // Handle generate final answer request
  private async handleGenerateFinalAnswer(args: unknown) {
    const parsed = GenerateFinalAnswerArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`generate_final_answer 参数无效: ${parsed.error}`);
    }
    const { session_id, documentation_prompt } = parsed.data;
    const session = this.getSession(session_id);

    // Build research data overview for the final report
    const researchData = {
      original_question: session.question, // Report topic
      total_iterations: session.iteration,
      total_searches: session.search_results.length,
      total_results: session.search_results.reduce((sum, sr) => sum + sr.results.length, 0),
      reflections: session.reflections, // All previous LLM reflection results
      // Final confidence is taken from the last reflection
      final_confidence:
        session.reflections.length > 0 ? session.reflections[session.reflections.length - 1].confidence_score : 0.5, // Defaults to 0.5 if no reflections
    };

    const locale = presenter.configPresenter.getLanguage?.() || "zh-CN"; // Get user language setting
    const finalDocumentationPrompt =
      documentation_prompt ||
      `${DEFAULT_DOCUMENTATION_PROMPT}
用户当前的系统语言是 ${locale}，请除非另有说明，否则用系统语言回复。`;

    // Build the complete research content for the LLM to generate the final report
    const completeResearchContent = {
      // research_question is already provided in researchData.original_question
      research_metadata: {
        // Research metadata
        session_id: session.session_id,
        session_created: session.created_at.toISOString(),
        session_duration: `${Math.round((new Date().getTime() - session.created_at.getTime()) / 1000 / 60)} 分钟`,
        total_iterations: researchData.total_iterations,
        total_searches: researchData.total_searches,
        total_sources: researchData.total_results,
        final_confidence_score: `${(researchData.final_confidence * 100).toFixed(1)}%`,
      },
      // research_reflections: LLM past reflection process, helping it understand the decision history.
      research_reflections: session.reflections.map((reflection, index) => ({
        iteration: index + 1, // Iteration count starts from 1
        needs_more_research: reflection.needs_more_research,
        confidence_score: `${(reflection.confidence_score * 100).toFixed(1)}%`,
        quality_assessment: reflection.quality_assessment,
        missing_information: reflection.missing_information,
        suggested_queries: reflection.suggested_queries,
      })),
      // consolidated_research_content: Merged summary text of all search results, the core basis for the LLM to generate the report.
      consolidated_research_content: session.search_results
        .map(
          (sr) =>
            `=== 搜索查询: ${sr.query} ===\n` +
            sr.results
              .map(
                (result, idx) =>
                  `[来源 ${idx + 1}] ${result.title}\n` +
                  `URL: ${result.url}\n` +
                  `发布日期: ${result.published_date || "未知"}\n` +
                  `内容摘要: ${result.snippet}\n` +
                  `---`,
              )
              .join("\n"),
        )
        .join("\n\n"),
      documentation_instructions: finalDocumentationPrompt, // Documentation generation instructions
      summary_instructions: `  // 最终报告生成指令
请根据上方完整的科研数据，为用户的问题：“${session.question}”生成一份全面且详细的研究报告。
报告应包括：
1. 问题概述和研究背景
2. 主要发现和关键信息点
3. 不同来源观点的比较分析
4. 具体的实施建议或解决方案
5. 相关最新发展和趋势
6. 参考文献和信息来源
请确保：
- 充分利用所有搜索结果中的信息
- 保持客观性和准确性
- 提供具体细节和示例
- 除非另有说明，否则请用用户的系统语言（${locale}）回复
- 适当引用具体来源和链接
`,
      cleanup_status: "此响应后会话数据将被清理",
      original_research_question: researchData.original_question, // Explicitly provide the original research question
    };

    session.is_completed = true; // Mark session as completed, ready for cleanup
    setTimeout(() => {
      // Delayed cleanup to ensure the response has been sent
      this.cleanupSession(session_id);
    }, 1000);

    return {
      content: [{ type: "text", text: JSON.stringify(completeResearchContent, null, 2) }],
    };
  }

  // Perform a single Bocha web search
  private async performSingleBochaSearch(query: string, maxResults: number): Promise<QuerySearchResult> {
    try {
      const response = await axios.post(
        "https://api.bochaai.com/v1/web-search", // Bocha API URL
        {
          query,
          summary: true, // Request summary
          freshness: "noLimit", // No time restriction
          count: maxResults, // Number of results
        },
        {
          headers: {
            Authorization: `Bearer ${this.bochaApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30-second timeout
        },
      );

      const searchResponse = response.data as BochaWebSearchResponse;
      const results = searchResponse.data?.webPages?.value || []; // Extract web page results

      return {
        query,
        results: results.map(
          (item): SearchResult => ({
            title: item.name,
            url: item.url,
            snippet: item.summary, // Use the summary returned by Bocha as the snippet
            published_date: item.datePublished,
          }),
        ),
      };
    } catch (error) {
      console.error(`查询 "${query}" 搜索失败:`, error);
      return { query, results: [] }; // Return empty results on failure
    }
  }

  // Clean up resources when the server instance is destroyed
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.researchSessions.clear(); // Clean up all sessions
    console.log("DeepResearchServer 已销毁，所有会话已清理");
  }

  // Get session statistics (for debugging and monitoring)
  public getSessionStats(): {
    total_sessions: number;
    active_sessions: number;
    completed_sessions: number;
    oldest_session_age_minutes: number;
  } {
    const now = new Date();
    let activeCount = 0;
    let completedCount = 0;
    let oldestAge = 0;

    for (const session of this.researchSessions.values()) {
      if (session.is_completed) {
        completedCount++;
      } else {
        activeCount++;
      }
      const ageMinutes = Math.round((now.getTime() - session.created_at.getTime()) / 1000 / 60);
      if (ageMinutes > oldestAge) {
        oldestAge = ageMinutes;
      }
    }

    return {
      total_sessions: this.researchSessions.size,
      active_sessions: activeCount,
      completed_sessions: completedCount, // Completed sessions that may not yet have been cleaned up
      oldest_session_age_minutes: oldestAge,
    };
  }
}
