import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import zod from "zod";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const BochaWebSearchArgsSchema = zod.object({
  query: zod.string().describe("Search query (required)"),
  freshness: zod
    .string()
    .optional()
    .default("noLimit")
    .describe(
      "The time range for the search results. (Available options YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD, noLimit, oneYear, oneMonth, oneWeek, oneDay. Default is noLimit)",
    ),
  count: zod.number().optional().default(10).describe("Number of results (1-50, default 10)"),
});

const BochaAiSearchArgsSchema = zod.object({
  query: zod.string().describe("Search query (required)"),
  freshness: zod
    .string()
    .optional()
    .default("noLimit")
    .describe(
      "The time range for the search results. (Available options noLimit, oneYear, oneMonth, oneWeek, oneDay. Default is noLimit)",
    ),
  count: zod.number().optional().default(10).describe("Number of results (1-50, default 10)"),
});

// Data structure returned by the Bocha API - Web Search
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
        summary: string; // use summary as the description
        siteName: string;
        siteIcon: string;
        dateLastCrawled: string;
        cachedPageUrl: string | null;
        language: string | null;
        isFamilyFriendly: boolean | null;
        isNavigational: boolean | null;
        datePublished?: string; // seems present in the Python version
      }>;
      isFamilyFriendly: boolean | null;
    };
    videos: unknown | null;
  };
}

// Data structure returned by the Bocha API - AI Search
interface BochaAiSearchResponse {
  messages?: Array<{
    content_type: string;
    content: string; // may need JSON.parse
  }>;
  // Other fields may exist; add as needed
}

// Parsed structure of AI Search content (webpage type)
interface AiSearchWebPageItem {
  name: string;
  url: string;
  summary: string;
  datePublished?: string;
  siteName?: string;
  // Add other possible fields as needed
}

// Define the MCP resource object structure
interface McpResource {
  uri: string;
  mimeType: string;
  text: string;
}

export class BochaSearchServer {
  private server: Server;
  private apiKey: string;

  constructor(env?: Record<string, unknown>) {
    const apiKey = String(env?.apiKey ?? "");
    if (!apiKey) {
      throw new Error("Bocha API Key is required");
    }
    this.apiKey = apiKey;

    // Create the server instance
    this.server = new Server(
      {
        name: "argos-inmemory/bocha-search-server",
        version: "0.1.2", // version bump
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
      return {
        tools: [
          {
            name: "bocha_web_search",
            description:
              "Search with Bocha Web Search and get enhanced search details from billions of web documents, including page titles, urls, summaries, site names, site icons, publication dates, image links, and more.", // official description
            inputSchema: zod.toJSONSchema(BochaWebSearchArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Bocha Web Search",
              readOnlyHint: true,
              openWorldHint: true,
            },
          },
          {
            name: "bocha_ai_search",
            description:
              "Search with Bocha AI Search, recognizes the semantics of search terms and additionally returns structured modal cards with content from vertical domains.", // official description
            inputSchema: zod.toJSONSchema(BochaAiSearchArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Bocha AI Search",
              readOnlyHint: true,
              openWorldHint: true,
            },
          },
        ],
      };
    });

    // Register the tool-call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "bocha_web_search": {
            const parsed = BochaWebSearchArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid search parameters: ${parsed.error}`);
            }

            const { query, count, freshness } = parsed.data;

            // Call the Bocha API
            const response = await axios.post(
              "https://api.bochaai.com/v1/web-search", // keep original endpoint; adjust if officially recommended
              {
                query,
                summary: true,
                freshness, // include freshness
                count,
              },
              {
                headers: {
                  Authorization: `Bearer ${this.apiKey}`,
                  "Content-Type": "application/json",
                },
              },
            );

            // Process the response data
            const searchResponse = response.data as BochaWebSearchResponse;

            if (!searchResponse.data?.webPages?.value || searchResponse.data.webPages.value.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: "No results found.", // unified message
                  },
                ],
              };
            }

            // Convert results to MCP resource format
            const results = searchResponse.data.webPages.value.map((item, index) => {
              // Build blob content
              const blobContent = {
                title: item.name,
                url: item.url,
                rank: index + 1,
                content: item.summary, // use summary
                icon: item.siteIcon,
                publishedDate: item.datePublished, // include published date
                siteName: item.siteName, // include site name
              };

              return {
                type: "resource",
                resource: {
                  uri: item.url,
                  mimeType: "application/argos-webpage", // custom Argos MIME type
                  text: JSON.stringify(blobContent),
                },
              };
            });

            // Append a search summary
            const summaryText = `Found ${results.length} results for "${query}"`;
            const summary = {
              type: "text",
              text: summaryText,
            };

            return {
              content: [summary, ...results],
            };
          }

          case "bocha_ai_search": {
            const parsed = BochaAiSearchArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid search parameters: ${parsed.error}`);
            }

            const { query, count, freshness } = parsed.data;

            // Call the Bocha AI Search API
            const response = await axios.post(
              "https://api.bochaai.com/v1/ai-search", // AI Search endpoint
              {
                query,
                freshness,
                count,
                answer: false, // matches the Python version
                stream: false, // matches the Python version
              },
              {
                headers: {
                  Authorization: `Bearer ${this.apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 10000, // timeout, matches the Python version
              },
            );

            const aiSearchResponse = response.data as BochaAiSearchResponse;
            const contentResults: Array<{ type: string; text?: string; resource?: McpResource }> = [];

            if (aiSearchResponse.messages && aiSearchResponse.messages.length > 0) {
              aiSearchResponse.messages.forEach((message) => {
                try {
                  if (message.content_type === "webpage") {
                    const webData = JSON.parse(message.content) as { value: AiSearchWebPageItem[] };
                    if (webData.value && Array.isArray(webData.value)) {
                      webData.value.forEach((item, index) => {
                        const blobContent = {
                          title: item.name,
                          url: item.url,
                          rank: index + 1, // Rank might need adjustment based on overall results
                          content: item.summary,
                          publishedDate: item.datePublished,
                          siteName: item.siteName,
                          // icon is not available in AI search response apparently
                        };
                        contentResults.push({
                          type: "resource",
                          resource: {
                            uri: item.url,
                            mimeType: "application/argos-webpage", // custom Argos MIME type
                            text: JSON.stringify(blobContent),
                          },
                        });
                      });
                    }
                  } else if (message.content_type !== "image" && message.content !== "{}") {
                    // Treat other non-empty, non-image content as text
                    contentResults.push({
                      type: "text",
                      text: message.content,
                    });
                  }
                } catch (e) {
                  console.error("Error parsing AI search message content:", e);
                  // Optionally add an error message to results
                  contentResults.push({
                    type: "text",
                    text: `Error processing result: ${message.content}`,
                  });
                }
              });
            }

            if (contentResults.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: "No results found.",
                  },
                ],
              };
            }

            // Append a summary
            const summaryText = `Found ${contentResults.filter((r) => r.type === "resource").length} web results and ${contentResults.filter((r) => r.type === "text").length} other content for "${query}" via AI Search.`;
            const summary = {
              type: "text",
              text: summaryText,
            };

            return {
              content: [summary, ...contentResults],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error("Error calling tool:", error); // Log the error server-side
        const errorMessage =
          error instanceof Error ? error.message : typeof error === "string" ? error : "An unknown error occurred";

        // Check for specific Axios errors
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const details = error.response?.data ? JSON.stringify(error.response.data) : error.message;
          const finalMessage = `Bocha API request failed: ${status ? `Status ${status}` : ""} - ${details}`;
          return {
            content: [{ type: "text", text: `Error: ${finalMessage}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }
}
