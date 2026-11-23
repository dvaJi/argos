import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpClient, ELICITATION_TIMEOUT_MS } from "@argos/mcp-runtime";
import { RuntimeHelper } from "../../../src/main/lib/runtimeHelper";
import path from "path";
import { pathToFileURL } from "node:url";
import fs from "fs";
import { ErrorCode, McpError } from "@argos/mcp-runtime";
import { Client, SSEClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpHostPorts } from "@argos/mcp-runtime";
import { getInMemoryServer } from "../../../src/main/presenter/mcpPresenter/inMemoryServers/builder";

const fsExistsSyncMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>());

// Mock electron modules
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<(...args: any[]) => any>((pathType: string) => {
      if (pathType === "home") return "/mock/home";
      return "/mock/app";
    }),
    getAppPath: vi.fn<(...args: any[]) => any>(() => "/mock/app"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "1.0.0"),
  },
}));

// Mock fs module
vi.mock("fs", () => ({
  existsSync: fsExistsSyncMock,
  default: {
    existsSync: fsExistsSyncMock,
  },
}));

// Mock eventBus
vi.mock("../../../src/main/eventbus", () => ({
  eventBus: {
    emit: vi.fn<(...args: any[]) => any>(),
    send: vi.fn<(...args: any[]) => any>(),
    on: vi.fn<(...args: any[]) => any>(),
    off: vi.fn<(...args: any[]) => any>(),
    once: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "all-windows",
  },
}));

// Mock presenter
const presenterMocks = vi.hoisted(() => ({
  handleSamplingRequest: vi.fn<(...args: any[]) => any>(),
  cancelSamplingRequest: vi.fn<(...args: any[]) => any>(),
  handleElicitationRequest: vi.fn<(...args: any[]) => any>(),
  cancelElicitationRequest: vi.fn<(...args: any[]) => any>(),
  executeWithRateLimit: vi.fn<(...args: any[]) => any>(),
  generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
  getProviderModels: vi.fn<(...args: any[]) => any>(),
  getCustomModels: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("../../../src/main/presenter", () => ({
  presenter: {
    configPresenter: {
      getMcpServers: vi.fn<(...args: any[]) => any>(),
      getProviderModels: presenterMocks.getProviderModels,
      getCustomModels: presenterMocks.getCustomModels,
    },
    mcpPresenter: {
      handleSamplingRequest: presenterMocks.handleSamplingRequest,
      cancelSamplingRequest: presenterMocks.cancelSamplingRequest,
      handleElicitationRequest: presenterMocks.handleElicitationRequest,
      cancelElicitationRequest: presenterMocks.cancelElicitationRequest,
    },
    llmproviderPresenter: {
      executeWithRateLimit: presenterMocks.executeWithRateLimit,
      generateCompletionStandalone: presenterMocks.generateCompletionStandalone,
    },
  },
}));

const mockHandleSamplingRequest = presenterMocks.handleSamplingRequest;
const mockCancelSamplingRequest = presenterMocks.cancelSamplingRequest;
const mockHandleElicitationRequest = presenterMocks.handleElicitationRequest;
const mockCancelElicitationRequest = presenterMocks.cancelElicitationRequest;
const mockGenerateCompletionStandalone = presenterMocks.generateCompletionStandalone;
const mockGetProviderModels = presenterMocks.getProviderModels;
const mockGetCustomModels = presenterMocks.getCustomModels;

// Mock other dependencies that might be imported by mcpClient
vi.mock("../../../src/main/events", () => ({
  MCP_EVENTS: {
    SERVER_STATUS_CHANGED: "server-status-changed",
  },
}));

vi.mock("../../../src/main/presenter/mcpPresenter/inMemoryServers/builder", () => ({
  getInMemoryServer: vi.fn<(...args: any[]) => any>(),
}));

// Mock MCP SDK modules (v2 — the runtime imports from @modelcontextprotocol/client)
vi.mock("@modelcontextprotocol/client", () => {
  class MockProtocolError extends Error {
    readonly code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    Client: vi.fn<(...args: any[]) => any>().mockImplementation(function () {
      return {
        connect: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        callTool: vi.fn<(...args: any[]) => any>(),
        listTools: vi.fn<(...args: any[]) => any>(),
        listPrompts: vi.fn<(...args: any[]) => any>(),
        getPrompt: vi.fn<(...args: any[]) => any>(),
        listResources: vi.fn<(...args: any[]) => any>(),
        readResource: vi.fn<(...args: any[]) => any>(),
        setNotificationHandler: vi.fn<(...args: any[]) => any>(),
        setRequestHandler: vi.fn<(...args: any[]) => any>(),
      };
    }),
    SSEClientTransport: vi.fn<(...args: any[]) => any>(),
    StreamableHTTPClientTransport: vi.fn<(...args: any[]) => any>(),
    InMemoryTransport: {
      createLinkedPair: vi.fn<(...args: any[]) => any>(() => [
        vi.fn<(...args: any[]) => any>(),
        vi.fn<(...args: any[]) => any>(),
      ]),
    },
    ProtocolError: MockProtocolError,
    UnauthorizedError: class MockUnauthorizedError extends Error {},
    ProtocolErrorCode: {
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
    },
  };
});

vi.mock("@modelcontextprotocol/client/stdio", () => ({
  StdioClientTransport: vi.fn<(...args: any[]) => any>().mockImplementation(function () {
    return {
      stderr: {
        on: vi.fn<(...args: any[]) => any>(),
      },
      close: vi.fn<(...args: any[]) => any>(),
    };
  }),
}));

const testPorts: McpHostPorts = {
  paths: { homeDir: () => "/tmp", appVersion: () => "0.0.0-test" },
  runtime: (() => {
    const rh = RuntimeHelper.getInstance();
    return {
      initializeRuntimes: () => rh.initializeRuntimes(),
      expandPath: (t: string) => rh.expandPath(t),
      processCommandWithArgs: (c: string, a: string[]) => rh.processCommandWithArgs(c, a),
      normalizePathEnv: (p: string[]) => rh.normalizePathEnv(p),
      getDefaultPaths: (h?: string) => rh.getDefaultPaths(h ?? ""),
      getBunRuntimePath: () => rh.getBunRuntimePath(),
      getUvRuntimePath: () => rh.getUvRuntimePath(),
      setBunRuntimePath: (p: string | null) => rh.setBunRuntimePath(p),
      setUvRuntimePath: (p: string | null) => rh.setUvRuntimePath(p),
    };
  })(),
  events: { broadcast: () => {}, broadcastError: () => {}, subscribe: () => () => {} },
  proxy: { getProxyUrl: () => null },
  services: {
    getMcpServers: async () => ({}),
    getInMemoryServer: (name, args, env) => getInMemoryServer(name, args, env) as never,
    handleSamplingRequest: (payload) => presenterMocks.handleSamplingRequest(payload) as Promise<unknown>,
    cancelSamplingRequest: (id, reason) => presenterMocks.cancelSamplingRequest(id, reason),
    handleElicitationRequest: (payload) => presenterMocks.handleElicitationRequest(payload) as Promise<unknown>,
    cancelElicitationRequest: (id, reason) => presenterMocks.cancelElicitationRequest(id, reason),
    generateCompletionStandalone: (...args) => presenterMocks.generateCompletionStandalone(...args) as Promise<string>,
    getProviderModels: (id) => presenterMocks.getProviderModels(id),
    getCustomModels: (id) => presenterMocks.getCustomModels(id),
  },
};

describe("McpClient Runtime Command Processing Tests", () => {
  let mockFsExistsSync: any;
  const runtimeHelper = RuntimeHelper.getInstance() as RuntimeHelper & {
    runtimesInitialized: boolean;
  };

  beforeEach(() => {
    mockFsExistsSync = vi.mocked<(...args: any[]) => any>(fs.existsSync);
    vi.clearAllMocks();
    mockFsExistsSync.mockReset();
    mockFsExistsSync.mockReturnValue(false);
    runtimeHelper.runtimesInitialized = false;
    runtimeHelper.setBunRuntimePath(null);
    runtimeHelper.setUvRuntimePath(null);

    mockHandleSamplingRequest.mockReset();
    mockCancelSamplingRequest.mockReset();
    mockHandleElicitationRequest.mockReset();
    mockCancelElicitationRequest.mockReset();
    mockGenerateCompletionStandalone.mockReset();
    mockGetProviderModels.mockReset();
    mockGetCustomModels.mockReset();
    vi.mocked<(...args: any[]) => any>(Client).mockImplementation(function () {
      return {
        connect: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        callTool: vi.fn<(...args: any[]) => any>(),
        listTools: vi.fn<(...args: any[]) => any>(),
        listPrompts: vi.fn<(...args: any[]) => any>(),
        getPrompt: vi.fn<(...args: any[]) => any>(),
        listResources: vi.fn<(...args: any[]) => any>(),
        readResource: vi.fn<(...args: any[]) => any>(),
        setNotificationHandler: vi.fn<(...args: any[]) => any>(),
        setRequestHandler: vi.fn<(...args: any[]) => any>(),
      } as any;
    });
    vi.mocked<(...args: any[]) => any>(StdioClientTransport).mockImplementation(function () {
      return {
        stderr: {
          on: vi.fn<(...args: any[]) => any>(),
        },
        close: vi.fn<(...args: any[]) => any>(),
      } as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("NPX Command Processing", () => {
    it("should keep npx command arguments unchanged for everything server", () => {
      const serverConfig = {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      };

      const client = new McpClient("everything", serverConfig, testPorts);

      // Access private method for testing
      const processedCommand = (client as any).processCommandWithArgs("npx", [
        "-y",
        "@modelcontextprotocol/server-everything",
      ]);

      expect(processedCommand.command).toContain("npx");
      expect(processedCommand.args).toEqual(["-y", "@modelcontextprotocol/server-everything"]);
    });

    it("should handle npx in command path correctly", () => {
      const serverConfig = {
        type: "stdio",
        command: "/usr/local/bin/npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      };

      const client = new McpClient("everything", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("/usr/local/bin/npx", [
        "-y",
        "@modelcontextprotocol/server-everything",
      ]);

      expect(processedCommand.command).toContain("npx");
      expect(processedCommand.args).toEqual(["-y", "@modelcontextprotocol/server-everything"]);
    });
  });

  describe("UVX Command Processing", () => {
    it("should preserve uvx command without modification for osm-mcp-server", () => {
      const serverConfig = {
        type: "stdio",
        command: "uvx",
        args: ["osm-mcp-server"],
      };

      const client = new McpClient("osm-mcp-server", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("uvx", ["osm-mcp-server"]);

      // Should keep uvx as is, only replace with runtime path
      expect(processedCommand.command).toContain("uvx");
      expect(processedCommand.args).toEqual(["osm-mcp-server"]); // No 'x' prefix added
    });

    it("should handle uvx command with runtime path replacement", () => {
      const serverConfig = {
        type: "stdio",
        command: "uvx",
        args: ["osm-mcp-server"],
      };

      const client = new McpClient("osm-mcp-server", serverConfig, testPorts);

      // Mock the runtime path for testing
      const uvRuntimePath = path.join("/mock/app/runtime/uv").replace("app.asar", "app.asar.unpacked");
      client.uvRuntimePath = uvRuntimePath;

      const processedCommand = (client as any).processCommandWithArgs("uvx", ["osm-mcp-server"]);

      // Should use the runtime path
      const expectedUvxPath =
        process.platform === "win32" ? path.join(uvRuntimePath, "uvx.exe") : path.join(uvRuntimePath, "uvx");

      expect(processedCommand.command.replace(/[\\/]+/g, "/")).toBe(expectedUvxPath.replace(/[\\/]+/g, "/"));
      expect(processedCommand.args).toEqual(["osm-mcp-server"]);
    });

    it("should handle uvx in command path correctly", () => {
      const serverConfig = {
        type: "stdio",
        command: "/usr/local/bin/uvx",
        args: ["osm-mcp-server"],
      };

      const client = new McpClient("osm-mcp-server", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("/usr/local/bin/uvx", ["osm-mcp-server"]);

      // Should replace with runtime uvx path
      expect(processedCommand.command).toContain("uvx");
      expect(processedCommand.args).toEqual(["osm-mcp-server"]);
    });
  });

  describe("Registered server-request handlers", () => {
    // Regression: v2 passes spec-method handlers the full request
    // ({ method, params }); treating it as params dropped the message, form
    // schema and sampling messages.
    it("forwards request.params of elicitation/create and sampling/createMessage", async () => {
      vi.mocked<(...args: any[]) => any>(StreamableHTTPClientTransport).mockImplementation(function () {
        return { close: vi.fn<(...args: any[]) => any>() } as any;
      });
      const client = new McpClient("remote", { type: "http", baseUrl: "https://mcp.example.test/mcp" }, testPorts);
      await client.connect().catch(() => {});
      const sdkClient = vi.mocked(Client).mock.results.at(-1)?.value as { setRequestHandler: ReturnType<typeof vi.fn> };
      const handlerFor = (method: string) =>
        sdkClient.setRequestHandler.mock.calls.find(([name]) => name === method)?.[1] as (
          request: unknown,
          extra: unknown,
        ) => Promise<unknown>;

      mockHandleElicitationRequest.mockResolvedValue({ action: "decline" });
      const schema = { type: "object", properties: { ok: { type: "boolean" } } };
      await handlerFor("elicitation/create")(
        { method: "elicitation/create", params: { message: "Deploy?", requestedSchema: schema } },
        { mcpReq: { id: 7 } },
      );
      expect(mockHandleElicitationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Deploy?", requestedSchema: schema }),
      );

      mockHandleSamplingRequest.mockResolvedValue({ requestId: "x", approved: false });
      await handlerFor("sampling/createMessage")(
        {
          method: "sampling/createMessage",
          params: { messages: [{ role: "user", content: { type: "text", text: "hi" } }], maxTokens: 10 },
        },
        { mcpReq: { id: 8 } },
      ).catch(() => {});
      expect(mockHandleSamplingRequest).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [expect.objectContaining({ text: "hi" })] }),
      );
    });
  });

  describe("Remote transport authorization", () => {
    // Regression: a static Authorization header used to be wrapped in a partial OAuth provider.
    // On a 401 the SDK then ran its OAuth flow and crashed with
    // "provider.clientInformation is not a function", hiding the real 401.
    it.each([
      ["http", StreamableHTTPClientTransport],
      ["sse", SSEClientTransport],
    ] as const)(
      "sends a static Authorization header as-is over %s without an authProvider",
      async (type, Transport) => {
        vi.mocked<(...args: any[]) => any>(Transport).mockImplementation(function () {
          return { close: vi.fn<(...args: any[]) => any>() } as any;
        });
        const client = new McpClient(
          "remote",
          {
            type,
            baseUrl: "https://mcp.example.test/mcp",
            customHeaders: { Authorization: "Bearer static-token", "X-Extra": "1" },
          },
          testPorts,
        );

        await client.connect().catch(() => {});

        expect(Transport).toHaveBeenCalledTimes(1);
        const [, options] = vi.mocked<(...args: any[]) => any>(Transport).mock.calls[0];
        expect(options.requestInit.headers).toEqual({ Authorization: "Bearer static-token", "X-Extra": "1" });
        expect(options.authProvider).toBeUndefined();
      },
    );

    it("keeps non-Bearer Authorization schemes instead of dropping them", async () => {
      vi.mocked<(...args: any[]) => any>(StreamableHTTPClientTransport).mockImplementation(function () {
        return { close: vi.fn<(...args: any[]) => any>() } as any;
      });
      const client = new McpClient(
        "remote",
        {
          type: "http",
          baseUrl: "https://mcp.example.test/mcp",
          customHeaders: { Authorization: "Basic dXNlcjpwYXNz" },
        },
        testPorts,
      );

      await client.connect().catch(() => {});

      const [, options] = vi.mocked<(...args: any[]) => any>(StreamableHTTPClientTransport).mock.calls[0];
      expect(options.requestInit.headers.Authorization).toBe("Basic dXNlcjpwYXNz");
    });
  });

  describe("Other Command Processing", () => {
    it("should handle node command replacement with bun", () => {
      const serverConfig = {
        type: "stdio",
        command: "node",
        args: ["server.js"],
      };

      const client = new McpClient("test", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("node", ["server.js"]);

      expect(processedCommand.command).toContain("node");
      expect(processedCommand.args).toEqual(["server.js"]);
    });

    it("should keep npm command processing stable", () => {
      const serverConfig = {
        type: "stdio",
        command: "npm",
        args: ["start"],
      };

      const client = new McpClient("test", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("npm", ["start"]);

      expect(processedCommand.command).toContain("npm");
      expect(processedCommand.args).toEqual(["start"]);
    });

    it("should handle uv command replacement correctly", () => {
      const serverConfig = {
        type: "stdio",
        command: "uv",
        args: ["run", "server.py"],
      };

      const client = new McpClient("test", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("uv", ["run", "server.py"]);

      expect(processedCommand.command).toContain("uv");
      expect(processedCommand.args).toEqual(["run", "server.py"]);
    });

    it("should not modify unknown commands", () => {
      const serverConfig = {
        type: "stdio",
        command: "python",
        args: ["server.py"],
      };

      const client = new McpClient("test", serverConfig, testPorts);

      const processedCommand = (client as any).processCommandWithArgs("python", ["server.py"]);

      // Should keep python command as is
      expect(processedCommand.command).toBe("python");
      expect(processedCommand.args).toEqual(["server.py"]);
    });
  });

  describe("Runtime Path Detection", () => {
    it("should detect uv runtime when files exist", () => {
      mockFsExistsSync.mockImplementation((filePath: string | Buffer | URL) => {
        const pathStr = String(filePath);
        return pathStr.includes("runtime/uv/uv");
      });

      const client = new McpClient("test", { type: "stdio" }, testPorts);

      expect((client as any).uvRuntimePath).toBeTruthy();
      expect((client as any).bunRuntimePath).toBeNull();
    });

    it("should handle missing runtime files gracefully", () => {
      mockFsExistsSync.mockReturnValue(false);

      const client = new McpClient("test", { type: "stdio" }, testPorts);

      expect((client as any).bunRuntimePath).toBeNull();
      expect((client as any).uvRuntimePath).toBeNull();
    });
  });

  describe("Environment Variable Processing", () => {
    it("should set npm registry environment variables", () => {
      const client = new McpClient("test", { type: "stdio" }, testPorts, "https://registry.npmmirror.com");

      // Check if npm registry is stored
      expect((client as any).npmRegistry).toBe("https://registry.npmmirror.com");
    });

    it("should handle null npm registry", () => {
      const client = new McpClient("test", { type: "stdio" }, testPorts, null);

      // Should handle null registry gracefully
      expect((client as any).npmRegistry).toBeNull();
    });

    it("should coerce stdio server env values to strings before spawning", async () => {
      const client = new McpClient(
        "test",
        {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: {
            TOKEN: 123,
            EMPTY: null,
            SKIP: undefined,
            PATH: "/custom/bin",
          },
        },
        testPorts,
      );

      await client.connect();

      const transportCalls = vi.mocked<(...args: any[]) => any>(StdioClientTransport).mock.calls;
      const transportOptions = transportCalls[transportCalls.length - 1][0] as {
        env: Record<string, string>;
      };

      expect(transportOptions.env.TOKEN).toBe("123");
      expect(transportOptions.env.EMPTY).toBe("");
      expect(transportOptions.env).not.toHaveProperty("SKIP");
      const pathKey = process.platform === "win32" ? "Path" : "PATH";
      expect(transportOptions.env[pathKey]).toContain("/custom/bin");
    });
  });

  describe("Path Expansion", () => {
    it("should expand tilde (~) in paths", () => {
      const client = new McpClient("test", { type: "stdio" }, testPorts);

      const expandedPath = (client as any).expandPath("~/test/path");

      expect(expandedPath).toBe("/mock/home/test/path");
    });

    it("should expand environment variables in paths", () => {
      // Set mock environment variable
      process.env.TEST_VAR = "/test/value";

      const client = new McpClient("test", { type: "stdio" }, testPorts);

      const expandedPath = (client as any).expandPath("/path/${TEST_VAR}/file");

      expect(expandedPath).toBe("/path//test/value/file");

      // Clean up
      delete process.env.TEST_VAR;
    });

    it("should handle simple $VAR format", () => {
      // Set mock environment variable
      process.env.TEST_PATH = "/simple/test";

      const client = new McpClient("test", { type: "stdio" }, testPorts);

      const expandedPath = (client as any).expandPath("/path/$TEST_PATH/file");

      expect(expandedPath).toBe("/path//simple/test/file");

      // Clean up
      delete process.env.TEST_PATH;
    });
  });

  describe("Sampling support", () => {
    it("should prepare sampling payload and chat messages from request params", () => {
      const client = new McpClient(
        "server-one",
        {
          type: "stdio",
          description: "Sample server",
        },
        testPorts,
      );

      const params = {
        systemPrompt: "You are a helpful assistant.",
        maxTokens: 128,
        modelPreferences: {
          costPriority: 0.5,
          hints: [{ name: "fast" }, { name: null }],
        },
        messages: [
          { role: "user", content: { type: "text", text: "hello" } },
          {
            role: "assistant",
            content: { type: "image", mimeType: "image/jpeg", data: "aGVsbG8=" },
          },
        ],
      };

      const { payload, chatMessages } = (client as any).prepareSamplingContext("req-123", params);

      expect(payload).toEqual({
        requestId: "req-123",
        serverName: "server-one",
        serverLabel: "Sample server",
        systemPrompt: "You are a helpful assistant.",
        maxTokens: 128,
        modelPreferences: {
          costPriority: 0.5,
          hints: [{ name: "fast" }, { name: undefined }],
        },
        requiresVision: true,
        messages: [
          { role: "user", type: "text", text: "hello" },
          {
            role: "assistant",
            type: "image",
            dataUrl: "data:image/jpeg;base64,aGVsbG8=",
            mimeType: "image/jpeg",
          },
        ],
      });

      expect(chatMessages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,aGVsbG8=", detail: "auto" },
            },
          ],
        },
      ]);
    });

    it("should default sampling image mime type to png when not provided", () => {
      const client = new McpClient(
        "server-two",
        {
          type: "stdio",
        },
        testPorts,
      );

      const { payload } = (client as any).prepareSamplingContext("req-vision", {
        messages: [
          {
            role: "user",
            content: { type: "image", data: "aGVsbG8=" },
          },
        ],
      });

      expect(payload.requiresVision).toBe(true);
      expect(payload.messages).toEqual([
        {
          role: "user",
          type: "image",
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
        },
      ]);
    });

    it("should throw when sampling image mime type is not allowed", () => {
      const client = new McpClient(
        "server-three",
        {
          type: "stdio",
        },
        testPorts,
      );

      try {
        (client as any).prepareSamplingContext("req-bad-mime", {
          messages: [
            {
              role: "user",
              content: { type: "image", mimeType: "image/svg+xml", data: "aGVsbG8=" },
            },
          ],
        });
        throw new Error("Expected prepareSamplingContext to throw for disallowed mime type");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as Error).message).toContain("Unsupported sampling image mime type: image/svg+xml");
      }
    });

    it("should throw when sampling image data is not valid base64", () => {
      const client = new McpClient(
        "server-four",
        {
          type: "stdio",
        },
        testPorts,
      );

      try {
        (client as any).prepareSamplingContext("req-bad-data", {
          messages: [
            {
              role: "assistant",
              content: { type: "image", data: "not_base64!!" },
            },
          ],
        });
        throw new Error("Expected prepareSamplingContext to throw for invalid image data");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as Error).message).toContain("Invalid sampling image payload received");
      }
    });

    it("should return assistant response when sampling decision is approved", async () => {
      const client = new McpClient(
        "code-reviewer",
        {
          type: "stdio",
          description: "Code Reviewer Server",
        },
        testPorts,
      );

      mockHandleSamplingRequest.mockResolvedValue({
        requestId: "rpc-001",
        approved: true,
        providerId: "provider-1",
        modelId: "model-42",
      });
      mockGenerateCompletionStandalone.mockResolvedValue("Generated response");
      mockGetProviderModels.mockReturnValue([{ id: "model-42", name: "Model Forty Two" }]);
      mockGetCustomModels.mockReturnValue([]);

      const params = {
        maxTokens: 256,
        systemPrompt: "System context",
        messages: [{ role: "user", content: { type: "text", text: "Explain this change." } }],
      };

      const result = await (client as any).handleSamplingCreateMessage(params, {
        mcpReq: { id: "rpc-001" },
      });

      expect(mockHandleSamplingRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.stringMatching(/^code-reviewer:[^:]+:rpc-001$/),
          serverName: "code-reviewer",
        }),
      );
      expect(mockGenerateCompletionStandalone).toHaveBeenCalledWith(
        "provider-1",
        [
          { role: "system", content: "System context" },
          { role: "user", content: "Explain this change." },
        ],
        "model-42",
        undefined,
        256,
      );

      expect(result).toEqual({
        role: "assistant",
        model: "Model Forty Two",
        stopReason: "endTurn",
        content: { type: "text", text: "Generated response" },
      });
    });

    it("should throw when sampling decision is rejected by the user", async () => {
      const client = new McpClient("code-reviewer", { type: "stdio" }, testPorts);

      mockHandleSamplingRequest.mockResolvedValue(
        {
          requestId: "rpc-002",
          approved: false,
        },
        testPorts,
      );

      const params = {
        messages: [{ role: "user", content: { type: "text", text: "hello" } }],
      };

      let caughtError: unknown;
      try {
        await (client as any).handleSamplingCreateMessage(params, { mcpReq: { id: "rpc-002" } });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain("User rejected sampling request");
      expect(caughtError).toHaveProperty("code", ErrorCode.InvalidRequest);

      expect(mockGenerateCompletionStandalone).not.toHaveBeenCalled();
    });
  });

  describe("Elicitation support", () => {
    it("passes the elicitation payload to the host and maps an accepted decision", async () => {
      const client = new McpClient("code-reviewer", { type: "stdio" }, testPorts);

      mockHandleElicitationRequest.mockResolvedValue({
        action: "accept",
        content: { confirm: true },
      });

      const params = {
        message: "Proceed with the deployment?",
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean", title: "Confirm" } },
          required: ["confirm"],
        },
      };

      const result = await (client as any).handleElicitationCreate(params, { mcpReq: { id: "rpc-el-1" } });

      expect(mockHandleElicitationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.stringMatching(/^code-reviewer:[^:]+:rpc-el-1$/),
          serverName: "code-reviewer",
          message: "Proceed with the deployment?",
          requestedSchema: params.requestedSchema,
        }),
      );
      expect(result).toEqual({ action: "accept", content: { confirm: true } });
    });

    it("declines when the host has no elicitation support", async () => {
      const portsWithoutElicitation = {
        ...testPorts,
        services: { ...testPorts.services, handleElicitationRequest: undefined },
      } as typeof testPorts;
      const client = new McpClient("code-reviewer", { type: "stdio" }, portsWithoutElicitation);

      const result = await (client as any).handleElicitationCreate(
        { message: "Proceed?" },
        { mcpReq: { id: "rpc-el-2" } },
      );

      expect(result).toEqual({ action: "decline" });
      expect(mockHandleElicitationRequest).not.toHaveBeenCalled();
    });

    it("maps host rejections to a decline response", async () => {
      const client = new McpClient("code-reviewer", { type: "stdio" }, testPorts);

      mockHandleElicitationRequest.mockRejectedValue(new Error("user dismissed the overlay"));

      const result = await (client as any).handleElicitationCreate(
        { message: "Proceed?" },
        { mcpReq: { id: "rpc-el-3" } },
      );

      expect(result).toEqual({ action: "decline" });
    });

    it("times out an unanswered elicitation as cancel and dismisses it on the host", async () => {
      vi.useFakeTimers();
      try {
        const client = new McpClient("code-reviewer", { type: "stdio" }, testPorts);
        mockHandleElicitationRequest.mockReturnValue(new Promise(() => undefined));
        presenterMocks.cancelElicitationRequest.mockResolvedValue(undefined);

        const pending = (client as any).handleElicitationCreate(
          { message: "Proceed?" },
          { mcpReq: { id: "rpc-el-t" } },
        );
        await vi.advanceTimersByTimeAsync(ELICITATION_TIMEOUT_MS + 1);

        await expect(pending).resolves.toEqual({ action: "cancel" });
        expect(presenterMocks.cancelElicitationRequest).toHaveBeenCalledWith(
          expect.stringMatching(/:rpc-el-t$/),
          expect.any(String),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("normalizes unknown decision actions to cancel", async () => {
      const client = new McpClient("code-reviewer", { type: "stdio" }, testPorts);

      mockHandleElicitationRequest.mockResolvedValue({ action: "banana" });

      const result = await (client as any).handleElicitationCreate(
        { message: "Proceed?" },
        { mcpReq: { id: "rpc-el-4" } },
      );

      expect(result).toEqual({ action: "cancel" });
    });
  });

  describe("Connection lifecycle", () => {
    it("shares one in-flight connect between concurrent callers", async () => {
      const client = new McpClient("remote", { type: "http", baseUrl: "http://127.0.0.1:1/mcp" }, testPorts);
      let release!: () => void;
      const connectOnce = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
      (client as any).connectOnce = connectOnce;

      const first = client.connect();
      const second = client.connect();
      release();
      await Promise.all([first, second]);

      expect(connectOnce).toHaveBeenCalledTimes(1);
      // A later connect starts a fresh attempt.
      const third = client.connect();
      release();
      await third;
      expect(connectOnce).toHaveBeenCalledTimes(2);
    });

    it("namespaces host-side request ids by server and connection", () => {
      const client = new McpClient("srv-a", { type: "stdio" }, testPorts);
      const other = new McpClient("srv-b", { type: "stdio" }, testPorts);
      const a = (client as any).resolveSamplingRequestId({ mcpReq: { id: 0 } });
      const b = (other as any).resolveSamplingRequestId({ mcpReq: { id: 0 } });

      expect(a).toMatch(/^srv-a:[^:]+:0$/);
      expect(b).toMatch(/^srv-b:[^:]+:0$/);
      expect(a).not.toBe(b);
    });
  });

  describe("Task-augmented tool calls (v2 task augmentation)", () => {
    function createTaskAwareClient(overrides?: {
      capabilities?: unknown;
      createResult?: unknown;
      taskStatus?: unknown;
      taskResult?: unknown;
      taskSupport?: string;
    }) {
      const client = new McpClient("long-runner", { type: "stdio" }, testPorts);
      const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
      const mockClient = {
        getServerCapabilities: vi.fn(() => overrides?.capabilities ?? { tasks: { requests: { tools: { call: {} } } } }),
        listTools: vi.fn(async () => ({
          tools: ["deploy", "ping"].map((name) => ({
            name,
            inputSchema: { type: "object" },
            ...(overrides?.taskSupport === "none"
              ? {}
              : { execution: { taskSupport: overrides?.taskSupport ?? "optional" } }),
          })),
        })),
        callTool: vi.fn(async () => overrides?.createResult ?? { content: [], isError: false }),
        // A real SDK method: it must be invoked with `this` bound to the client.
        request: vi.fn(async function (this: unknown, request: { method: string; params: Record<string, unknown> }) {
          if (this !== mockClient) throw new TypeError("request() called without its client receiver");
          calls.push({ method: request.method, params: request.params });
          if (request.method === "tools/call") {
            return overrides?.createResult ?? { task: { taskId: "t1", status: "working", pollInterval: 1 } };
          }
          if (request.method === "tasks/get") {
            return overrides?.taskStatus ?? { taskId: "t1", status: "completed" };
          }
          if (request.method === "tasks/result") {
            return overrides?.taskResult ?? { content: [{ type: "text", text: "Task finished" }], isError: false };
          }
          return {};
        }),
      };
      (client as any).client = mockClient;
      (client as any).isConnected = true;
      return { client, mockClient, calls };
    }

    it("runs tools through task augmentation and maps the final result", async () => {
      const { client, mockClient } = createTaskAwareClient();

      const result = await client.callTool("deploy", { env: "prod" });

      expect(result).toEqual({ content: [{ type: "text", text: "Task finished" }], isError: false });
      expect(mockClient.callTool).not.toHaveBeenCalled();
      expect(mockClient.request.mock.calls[0][0]).toEqual({
        method: "tools/call",
        params: { name: "deploy", arguments: { env: "prod" }, task: {} },
      });
      const methods = mockClient.request.mock.calls.map(([req]: [{ method: string }]) => req.method);
      expect(methods).toContain("tasks/get");
      expect(methods).toContain("tasks/result");
    });

    it("broadcasts progress events correlated with the LLM tool-call id", async () => {
      const { client } = createTaskAwareClient();

      const broadcasts: Array<{ channel: string; payload: Record<string, unknown> }> = [];
      const ports = (client as any).ports;
      const originalBroadcast = ports.events.broadcast;
      ports.events.broadcast = (channel: string, payload: unknown) => {
        broadcasts.push({ channel, payload: payload as Record<string, unknown> });
        originalBroadcast(channel, payload);
      };

      await client.callTool("deploy", {}, { toolCallId: "chat_tc_42" });

      const progressEvents = broadcasts.filter((b) => b.channel === "mcp:tool-call-progress");
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      expect(progressEvents[0].payload).toMatchObject({
        serverName: "long-runner",
        toolName: "deploy",
        toolCallId: "chat_tc_42",
        taskId: "t1",
        status: "working",
      });
      const completedEvent = progressEvents.find((e) => e.payload.status === "completed");
      expect(completedEvent).toBeDefined();
    });

    it("throws when the task ends in failure", async () => {
      const { client } = createTaskAwareClient({
        taskStatus: { taskId: "t2", status: "failed", statusMessage: "deploy failed" },
        taskResult: { content: [], isError: true },
      });

      let caughtError: unknown;
      try {
        await client.callTool("deploy", {});
      } catch (error) {
        caughtError = error;
      }
      expect((caughtError as Error).message).toBe("deploy failed");
    });

    it("stops polling on input_required and blocks on tasks/result", async () => {
      const { client, calls } = createTaskAwareClient({
        taskStatus: { taskId: "t1", status: "input_required" },
      });

      const result = await client.callTool("deploy", {});

      expect(result).toEqual({ content: [{ type: "text", text: "Task finished" }], isError: false });
      expect(calls.filter((c) => c.method === "tasks/get")).toHaveLength(1);
      expect(calls.map((c) => c.method)).toContain("tasks/result");
    });

    it("sends tasks/cancel and rejects when the caller aborts", async () => {
      const { client, calls } = createTaskAwareClient({
        taskStatus: { taskId: "t1", status: "working" },
      });
      const controller = new AbortController();

      const pending = client.callTool("deploy", {}, { signal: controller.signal });
      setTimeout(() => controller.abort(), 20);

      await expect(pending).rejects.toThrow("cancelled");
      expect(calls.map((c) => c.method)).toContain("tasks/cancel");
      expect(calls.map((c) => c.method)).not.toContain("tasks/result");
    });

    it("settles the progress indicator when tasks/get fails mid-poll", async () => {
      const { client, mockClient } = createTaskAwareClient();
      const original = mockClient.request.getMockImplementation()!;
      mockClient.request.mockImplementation(async function (this: unknown, req: { method: string }) {
        if (req.method === "tasks/get") throw new Error("server went away");
        return original.call(this, req as never);
      });
      const statuses: unknown[] = [];
      const ports = (client as any).ports;
      const originalBroadcast = ports.events.broadcast;
      ports.events.broadcast = (channel: string, payload: { status?: unknown }) => {
        if (channel === "mcp:tool-call-progress") statuses.push(payload.status);
        originalBroadcast(channel, payload);
      };

      await expect(client.callTool("deploy", {}, { toolCallId: "tc-1" })).rejects.toThrow("server went away");
      ports.events.broadcast = originalBroadcast;

      expect(statuses).toEqual(["working", "failed"]);
    });

    it("keeps the tool cache when the caller aborts", async () => {
      const { client } = createTaskAwareClient({ taskStatus: { taskId: "t1", status: "working" } });
      await client.listTools();
      const cached = (client as any).cachedTools;
      const controller = new AbortController();
      const pending = client.callTool("deploy", {}, { signal: controller.signal });
      setTimeout(() => controller.abort(), 20);

      await expect(pending).rejects.toThrow("cancelled");
      expect((client as any).cachedTools).toBe(cached);
    });

    it("passes the abort signal to plain tool calls", async () => {
      const { client, mockClient } = createTaskAwareClient({
        capabilities: {},
        createResult: { content: [{ type: "text", text: "ok" }], isError: false },
      });
      const controller = new AbortController();

      await client.callTool("ping", {}, { signal: controller.signal });

      expect(mockClient.callTool).toHaveBeenCalledWith({ name: "ping", arguments: {} }, { signal: controller.signal });
    });

    it.each(["none", "forbidden"])(
      "uses the plain request for tools that do not opt into tasks (taskSupport: %s)",
      async (taskSupport) => {
        const { client, mockClient } = createTaskAwareClient({
          taskSupport,
          createResult: { content: [{ type: "text", text: "plain" }], isError: false },
        });

        const result = await client.callTool("ping", {});

        expect(mockClient.request).not.toHaveBeenCalled();
        expect(mockClient.callTool).toHaveBeenCalledWith({ name: "ping", arguments: {} });
        expect(result).toEqual({ content: [{ type: "text", text: "plain" }], isError: false });
      },
    );

    it("falls back to the plain request when the server does not advertise tasks", async () => {
      const { client, mockClient } = createTaskAwareClient({
        capabilities: {},
        createResult: { content: [{ type: "text", text: "Task finished" }], isError: false },
      });

      const result = await client.callTool("ping", {});

      expect(mockClient.request).not.toHaveBeenCalled();
      expect(mockClient.callTool).toHaveBeenCalledWith({ name: "ping", arguments: {} });
      expect(result).toEqual({ content: [{ type: "text", text: "Task finished" }], isError: false });
    });
  });

  describe("Roots support", () => {
    it("exposes the server cwd as a file:// root", () => {
      const client = new McpClient(
        "workspace-server",
        { type: "stdio", command: "node", cwd: "/repo/workspace" },
        testPorts,
      );

      const result = (client as any).handleListRoots();

      expect(result.roots).toEqual([{ uri: pathToFileURL("/repo/workspace").href, name: "workspace" }]);
    });

    it("returns no roots when the server has no cwd", () => {
      const client = new McpClient("remote-server", { type: "sse", baseUrl: "https://example.com/mcp" }, testPorts);

      const result = (client as any).handleListRoots();

      expect(result.roots).toEqual([]);
    });
  });
});
