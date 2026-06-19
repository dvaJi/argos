import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toJSONSchema, z } from "zod";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import axios from "axios";

// Schema definitions
const BraveWebSearchArgsSchema = z.object({
  query: z.string().describe("Search query (max 400 chars, 50 words)"),
  count: z.number().optional().default(10).describe("Number of results (1-20, default 10)"),
  offset: z.number().optional().default(0).describe("Pagination offset (max 9, default 0)"),
});

const BraveLocalSearchArgsSchema = z.object({
  query: z.string().describe("Local search query (e.g. 'pizza near Central Park')"),
  count: z.number().optional().default(5).describe("Number of results (1-20, default 5)"),
});

// Data structure returned by the Brave Web API
interface BraveWeb {
  web?: {
    results?: Array<{
      title: string;
      description: string;
      url: string;
      language?: string;
      published?: string;
      rank?: number;
    }>;
  };
  locations?: {
    results?: Array<{
      id: string;
      title?: string;
    }>;
  };
}

// Data structure returned by the Brave Location API
interface BraveLocation {
  id: string;
  name: string;
  address: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  phone?: string;
  rating?: {
    ratingValue?: number;
    ratingCount?: number;
  };
  openingHours?: string[];
  priceRange?: string;
}

interface BravePoiResponse {
  results: BraveLocation[];
}

interface BraveDescription {
  descriptions: { [id: string]: string };
}

// Rate limit configuration
const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000,
};

export class BraveSearchServer {
  private server: Server;
  private apiKey: string;
  private requestCount = {
    second: 0,
    month: 0,
    lastReset: Date.now(),
  };

  constructor(env?: Record<string, unknown>) {
    const apiKey = String(env?.apiKey ?? "");
    if (!apiKey) {
      throw new Error("Brave API Key is required");
    }
    this.apiKey = apiKey;

    // Create the server instance
    this.server = new Server(
      {
        name: "argos-inmemory/brave-search-server",
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

  // Check rate limit
  private checkRateLimit() {
    const now = Date.now();
    if (now - this.requestCount.lastReset > 1000) {
      this.requestCount.second = 0;
      this.requestCount.lastReset = now;
    }
    if (this.requestCount.second >= RATE_LIMIT.perSecond || this.requestCount.month >= RATE_LIMIT.perMonth) {
      throw new Error("Rate limit exceeded");
    }
    this.requestCount.second++;
    this.requestCount.month++;
  }

  // Perform a web search
  private async performWebSearch(query: string, count: number = 10, offset: number = 0) {
    this.checkRateLimit();

    try {
      const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
        params: {
          q: query,
          count: Math.min(count, 20).toString(), // API limit
          offset: offset.toString(),
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
        },
      });

      const data = response.data as BraveWeb;

      // Extract web results
      const results = (data.web?.results || []).map((result) => ({
        title: result.title || "",
        description: result.description || "",
        url: result.url || "",
      }));

      return results.map((r, index) => {
        // Build blob content
        const blobContent = {
          title: r.title,
          url: r.url,
          rank: index + 1,
          content: r.description,
        };

        return {
          type: "resource",
          resource: {
            uri: r.url,
            mimeType: "application/argos-webpage",
            text: JSON.stringify(blobContent),
          },
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Brave Web search error: ${errorMessage}`);
    }
  }

  // Perform a local search
  private async performLocalSearch(query: string, count: number = 5) {
    this.checkRateLimit();

    try {
      // Initial search to obtain location IDs
      const webResponse = await axios.get("https://api.search.brave.com/res/v1/web/search", {
        params: {
          q: query,
          search_lang: "en",
          result_filter: "locations",
          count: Math.min(count, 20).toString(),
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
        },
      });

      const webData = webResponse.data as BraveWeb;
      const locationIds =
        webData.locations?.results?.filter((r): r is { id: string; title?: string } => r.id != null).map((r) => r.id) ||
        [];

      if (locationIds.length === 0) {
        // Fall back to web search when no local results exist
        return await this.performWebSearch(query, count);
      }

      // Fetch POI details and descriptions
      const [poisData, descriptionsData] = await Promise.all([
        this.getPoisData(locationIds),
        this.getDescriptionsData(locationIds),
      ]);

      // Format results as MCP resources
      return poisData.results.map((poi, index) => {
        const address =
          [
            poi.address?.streetAddress ?? "",
            poi.address?.addressLocality ?? "",
            poi.address?.addressRegion ?? "",
            poi.address?.postalCode ?? "",
          ]
            .filter((part) => part !== "")
            .join(", ") || "N/A";

        const blobContent = {
          title: poi.name,
          address: address,
          phone: poi.phone || "N/A",
          rating: `${poi.rating?.ratingValue ?? "N/A"} (${poi.rating?.ratingCount ?? 0} reviews)`,
          priceRange: poi.priceRange || "N/A",
          hours: (poi.openingHours || []).join(", ") || "N/A",
          description: descriptionsData.descriptions[poi.id] || "No description available",
          rank: index + 1,
        };

        // Use the POI's unique identifier as the URI
        return {
          type: "resource",
          resource: {
            uri: `brave-local://${poi.id}`,
            mimeType: "application/argos-local-business",
            text: JSON.stringify(blobContent),
          },
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Brave Local search error: ${errorMessage}`);
    }
  }

  // Fetch POI data
  private async getPoisData(ids: string[]): Promise<BravePoiResponse> {
    this.checkRateLimit();

    const url = new URL("https://api.search.brave.com/res/v1/local/pois");
    ids.filter(Boolean).forEach((id) => url.searchParams.append("ids", id));

    const response = await axios.get(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
    }

    return response.data as BravePoiResponse;
  }

  // Fetch description data
  private async getDescriptionsData(ids: string[]): Promise<BraveDescription> {
    this.checkRateLimit();

    const url = new URL("https://api.search.brave.com/res/v1/local/descriptions");
    ids.filter(Boolean).forEach((id) => url.searchParams.append("ids", id));

    const response = await axios.get(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
    }

    return response.data as BraveDescription;
  }

  // Set up request handlers
  private setupRequestHandlers(): void {
    // Register the tools-list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "brave_web_search",
            description:
              "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. " +
              "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
              "Supports pagination, content filtering, and freshness controls. " +
              "Maximum 20 results per request, with offset for pagination. ",
            inputSchema: toJSONSchema(BraveWebSearchArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Brave Web Search",
              readOnlyHint: true,
              openWorldHint: true,
            },
          },
          {
            name: "brave_local_search",
            description:
              "Searches for local businesses and places using Brave's Local Search API. " +
              "Best for queries related to physical locations, businesses, restaurants, services, etc. " +
              "Returns detailed information including:\n" +
              "- Business names and addresses\n" +
              "- Ratings and review counts\n" +
              "- Phone numbers and opening hours\n" +
              "Use this when the query implies 'near me' or mentions specific locations. " +
              "Automatically falls back to web search if no local results are found.",
            inputSchema: toJSONSchema(BraveLocalSearchArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Brave Local Search",
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
          case "brave_web_search": {
            const parsed = BraveWebSearchArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid search parameters: ${parsed.error}`);
            }

            const { query, count, offset } = parsed.data;
            const results = await this.performWebSearch(query, count, offset);

            // Append a search summary
            const summary = {
              type: "text",
              text: `Found ${results.length} results for "${query}"`,
            };

            return {
              content: [summary, ...results],
            };
          }

          case "brave_local_search": {
            const parsed = BraveLocalSearchArgsSchema.safeParse(args);
            if (!parsed.success) {
              throw new Error(`Invalid search parameters: ${parsed.error}`);
            }

            const { query, count } = parsed.data;
            const results = await this.performLocalSearch(query, count);

            // Determine whether these are local results or a web-search fallback
            const isLocalResults = results.length > 0 && results[0].resource?.uri.startsWith("brave-local://");
            const summary = {
              type: "text",
              text: isLocalResults
                ? `Found ${results.length} local results for "${query}"`
                : `No local results found, falling back to web search; found ${results.length} result(s)`,
            };

            return {
              content: [summary, ...results],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }
}
