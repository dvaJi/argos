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
  question: z.string().describe("The research question or topic to start the deep research with."),
});

// SingleWebSearchArgsSchema: Parameters for a single web search.
const SingleWebSearchArgsSchema = z.object({
  session_id: z.string().describe("The research session ID returned by start_deep_research."),
  query: z.string().describe("The single search query to execute."),
  max_results: z
    .number()
    .min(5)
    .max(15)
    .default(10)
    .describe("The maximum number of results for this search query (5-15)."),
});

// RequestResearchDataArgsSchema: Parameters for the LLM to request accumulated search results for reflection.
const RequestResearchDataArgsSchema = z.object({
  session_id: z.string().describe("The research session ID."),
  iteration: z
    .number()
    .describe("The current research iteration count. The LLM should maintain and pass this value itself."),
});

// SubmitReflectionResultsArgsSchema: Parameters for the LLM to submit reflection results.
const SubmitReflectionResultsArgsSchema = z.object({
  session_id: z.string().describe("The research session ID."),
  iteration: z.number().describe("The iteration count for this reflection."),
  needs_more_research: z.boolean().describe("Whether the LLM believes more research is needed after analysis."),
  missing_information: z
    .array(z.string())
    .describe("List of missing information identified by the LLM, if more research is needed."),
  quality_assessment: z.string().describe("The LLM's quality assessment of the current research results."),
  suggested_queries: z
    .array(z.string())
    .describe("Follow-up search queries suggested by the LLM based on current information and gaps."),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe("The LLM's confidence (0-1) in the completeness and accuracy of the current research."),
});

// GenerateFinalAnswerArgsSchema: Parameters for generating the final research report.
const GenerateFinalAnswerArgsSchema = z.object({
  session_id: z.string().describe("The research session ID returned by start_deep_research."),
  documentation_prompt: z.string().optional().describe("Custom documentation generation prompt."),
});

// Default document generation prompt
const DEFAULT_DOCUMENTATION_PROMPT = `
For all queries, search the web broadly for the latest information. Research multiple sources. Use all available tools to gather as much context as possible. Include screenshots when appropriate.
Follow the guidelines below when creating documentation:
1. Content quality:
  Clear, concise, and factually accurate
  Logically structured
  Comprehensive coverage of the topic
  Technically precise, with attention to detail
  No unnecessary commentary or humor
2. Documentation style:
  Professional and objective tone
  Thorough explanations with appropriate technical depth
  Well-formatted, with appropriate headings, lists, and code blocks
  Consistent terminology and naming conventions
  Clean, readable layout with no superfluous elements
3. Code quality:
  Clean, maintainable, well-commented code
  Follow best practices and modern patterns
  Appropriate error handling and edge-case consideration
  Optimized for performance and efficiency
  Follow language-specific style guides
4. Technical expertise:
  Programming languages and frameworks
  System architecture and design patterns
  Development methodologies and practices
  Security considerations and standards
  Industry-standard tools and technologies
5. Documentation requirements:
  When asked, create an extremely detailed, comprehensive Markdown document on the given topic.
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
      throw new Error("BOCHA_API_KEY is required");
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
      console.log(`Cleaned up expired research session: ${sessionId}`);
    });

    // If the session count exceeds the limit, clean up the least recently accessed sessions
    if (this.researchSessions.size > this.MAX_SESSIONS) {
      const sortedSessions = Array.from(this.researchSessions.entries()).sort(
        ([, a], [, b]) => a.last_accessed_at.getTime() - b.last_accessed_at.getTime(),
      );

      const toRemove = sortedSessions.slice(0, this.researchSessions.size - this.MAX_SESSIONS);
      toRemove.forEach(([sessionId]) => {
        this.researchSessions.delete(sessionId);
        console.log(`Cleaned up old research session due to over-limit: ${sessionId}`);
      });
    }
  }

  // Get the research session with the specified ID and update its last accessed time
  private getSession(sessionId: string): ResearchSession {
    const session = this.researchSessions.get(sessionId);
    if (!session) {
      throw new Error(`Research session not found: ${sessionId}`);
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
      console.log(`Research session cleaned up: ${sessionId}`);
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
            description: "Start a new deep research session. Returns a session_id for subsequent operations.",
            inputSchema: zodToJsonSchema(StartDeepResearchArgsSchema),
            annotations: {
              title: "Start Deep Research",
              destructiveHint: false,
            },
          },
          {
            name: "execute_single_web_search",
            description: "Execute a single web search within the research session.",
            inputSchema: zodToJsonSchema(SingleWebSearchArgsSchema),
            annotations: {
              title: "Execute Web Search",
              readOnlyHint: false,
              openWorldHint: true,
            },
          },
          {
            name: "request_research_data",
            description:
              "Request the new search results and research context from the current session, for the LLM to reflect on.",
            inputSchema: zodToJsonSchema(RequestResearchDataArgsSchema),
            annotations: {
              title: "Request Research Data",
              readOnlyHint: true,
            },
          },
          {
            name: "submit_reflection_results",
            description:
              "LLM submits its reflection on the research data (e.g., whether more research is needed, suggested queries, etc.).",
            inputSchema: zodToJsonSchema(SubmitReflectionResultsArgsSchema),
            annotations: {
              title: "Submit Reflection Results",
              destructiveHint: false,
            },
          },
          {
            name: "generate_final_answer",
            description: "Generate a final answer from the accumulated research and clean up the session data.",
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
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error("Error invoking tool:", error);
        const errorMessage =
          error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  // Handle start deep research request
  private async handleStartDeepResearch(args: unknown) {
    const parsed = StartDeepResearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`start_deep_research: invalid parameters: ${parsed.error}`);
    }
    const { question } = parsed.data;
    const session = this.createSession(question);

    // Optimization: return a concise response with session_id and next-step instructions
    const response = {
      session_id: session.session_id,
      next_steps: `Research session created (ID: ${session.session_id}). The LLM should generate initial search queries and use execute_single_web_search to perform searches. When done, call request_research_data to receive the data for reflection.`,
    };
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  }

  // Handle single web search request
  private async handleSingleWebSearch(args: unknown) {
    const parsed = SingleWebSearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`execute_single_web_search: invalid parameters: ${parsed.error}`);
    }
    const { session_id, query, max_results } = parsed.data;
    const session = this.getSession(session_id);

    try {
      const searchResult = await this.performSingleBochaSearch(query, max_results);
      session.search_results.push(searchResult); // Store search results

      // Optimization: return a concise response with result count and next-step instructions
      const response = {
        results_count: searchResult.results.length,
        next_steps: `Search results have been stored. You may continue searching, or call request_research_data to receive the data for reflection.`,
      };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      const axiosError = error as { message?: string };
      console.error("Single web search error:", axiosError.message);
      throw new Error(`Single web search failed: ${axiosError.message}`);
    }
  }

  // Handle request for research data (incremental delivery)
  private async handleRequestResearchData(args: unknown) {
    const parsed = RequestResearchDataArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`request_research_data: invalid parameters: ${parsed.error}`);
    }
    const { session_id } = parsed.data; // iteration is maintained by the LLM
    const session = this.getSession(session_id);

    // Compute and send new search results since the last reflection
    const startIndex = session.last_reflected_search_index + 1;
    const newSearchResults = session.search_results.slice(startIndex);

    const newConsolidatedResearchContent = newSearchResults
      .map(
        (sr) =>
          `=== Search query: ${sr.query} ===\n` +
          sr.results
            .map(
              (result, idx) =>
                `[Source ${idx + 1}] ${result.title}\n` +
                `URL: ${result.url}\n` +
                `Published date: ${result.published_date || "Unknown"}\n` +
                `Summary: ${result.snippet}\n` + // Uses the summary provided by Bocha
                `---`,
            )
            .join("\n"),
      )
      .join("\n\n");

    // Optimization: return a concise response with only new results and reflection instructions
    const response = {
      new_search_results_to_reflect: newConsolidatedResearchContent, // Send only new search results
      reflection_instructions: `
You are a rigorous research analyst. You have just received a batch of new search results.
Combine these new results with the historical research data you (the LLM) already have, and perform a comprehensive evaluation of the **entire accumulated research context**.
Based on this **entire accumulated research context**, decide whether the research question has been sufficiently answered: "${session.question}".

Your task is to produce a structured JSON result with the following fields:
- needs_more_research: boolean (whether more research is needed)
- missing_information: string[] (if more research is needed, list the missing information)
- quality_assessment: string (quality assessment of the current research)
- suggested_queries: string[] (if more research is needed, suggest 3-5 new queries)
- confidence_score: number (0-1, your confidence in the completeness and accuracy of the current research)

Output strictly as JSON. Do not include any additional explanation.
`,
      next_steps: `The LLM should use the data and instructions above to reflect, then call submit_reflection_results to submit the analysis.`,
    };
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  }

  // Handle submit reflection results request
  private async handleSubmitReflectionResults(args: unknown) {
    const parsed = SubmitReflectionResultsArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`submit_reflection_results: invalid parameters: ${parsed.error}`);
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
      ? `The LLM's analysis indicates that more research is needed. The suggested follow-up queries have been updated. The LLM should use the suggested queries to perform additional searches.`
      : `The LLM's analysis indicates that enough information has been gathered. The LLM should call generate_final_answer to produce the final report.`;

    return {
      content: [{ type: "text", text: JSON.stringify({ next_steps: nextStepsMessage }, null, 2) }],
    };
  }

  // Handle generate final answer request
  private async handleGenerateFinalAnswer(args: unknown) {
    const parsed = GenerateFinalAnswerArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`generate_final_answer: invalid parameters: ${parsed.error}`);
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
The user's current system language is ${locale}; unless otherwise specified, please respond in the system language.`;

    // Build the complete research content for the LLM to generate the final report
    const completeResearchContent = {
      // research_question is already provided in researchData.original_question
      research_metadata: {
        // Research metadata
        session_id: session.session_id,
        session_created: session.created_at.toISOString(),
        session_duration: `${Math.round((new Date().getTime() - session.created_at.getTime()) / 1000 / 60)} minutes`,
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
            `=== Search query: ${sr.query} ===\n` +
            sr.results
              .map(
                (result, idx) =>
                  `[Source ${idx + 1}] ${result.title}\n` +
                  `URL: ${result.url}\n` +
                  `Published date: ${result.published_date || "Unknown"}\n` +
                  `Summary: ${result.snippet}\n` +
                  `---`,
              )
              .join("\n"),
        )
        .join("\n\n"),
      documentation_instructions: finalDocumentationPrompt, // Documentation generation instructions
      summary_instructions: `  // Final report generation instructions
Based on the complete research data above, generate a comprehensive and detailed research report for the user's question: "${session.question}".
The report should include:
1. Problem overview and research background
2. Main findings and key information points
3. Comparative analysis of viewpoints from different sources
4. Concrete implementation recommendations or solutions
5. Recent developments and trends
6. References and sources
Please ensure:
- Fully leverage the information in all search results
- Maintain objectivity and accuracy
- Provide specific details and examples
- Unless otherwise specified, respond in the user's system language (${locale})
- Cite specific sources and links as appropriate
`,
      cleanup_status: "Session data will be cleaned up after this response",
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
      console.error(`Query "${query}" search failed:`, error);
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
    console.log("DeepResearchServer destroyed; all sessions cleared");
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
