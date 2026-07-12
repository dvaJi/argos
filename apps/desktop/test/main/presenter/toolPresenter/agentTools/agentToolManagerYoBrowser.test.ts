import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import { AgentToolManager } from "#/presenter/toolPresenter/agentTools/agentToolManager";
import { YoBrowserUnavailableError, buildYoBrowserUnavailablePayload } from "#/presenter/browser/YoBrowserErrors";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  nativeImage: {
    createFromPath: () => ({
      getSize: () => ({ width: 128, height: 96 }),
    }),
  },
}));

describe("AgentToolManager YoBrowser routing", () => {
  let manager: AgentToolManager;
  let yoBrowserCallTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    yoBrowserCallTool = vi.fn<(...args: any[]) => any>();
    manager = new AgentToolManager({
      agentWorkspacePath: null,
      configPresenter: {
        getSkillsEnabled: () => false,
        getSkillsPath: () => os.tmpdir(),
        getModelConfig: vi.fn<(...args: any[]) => any>(),
        resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
      } as any,
      runtimePort: {
        resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
        resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
        getSkillPresenter: () =>
          ({
            getActiveSkills: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            getActiveSkillsAllowedTools: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            listSkillScripts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
            getSkillExtension: vi.fn<(...args: any[]) => any>(),
          }) as any,
        getYoBrowserToolHandler: () => ({
          getToolDefinitions: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
          callTool: yoBrowserCallTool,
        }),
        getFilePresenter: () => ({
          getMimeType: vi.fn<(...args: any[]) => any>(),
          prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
        }),
        getLlmProviderPresenter: () => ({
          executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
          generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
          generateImageStandalone: vi.fn<(...args: any[]) => any>(),
        }),
        createSettingsWindow: vi.fn<(...args: any[]) => any>(),
        sendToWindow: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
        getApprovedFilePaths: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
        consumeSettingsApproval: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
      } as any,
    });
  });

  it("returns recoverable YoBrowser CDP failures as errored structured tool results", async () => {
    const browserStatus = {
      initialized: false,
      page: null,
      canGoBack: false,
      canGoForward: false,
      visible: false,
      loading: false,
    };
    yoBrowserCallTool.mockRejectedValue(
      new YoBrowserUnavailableError(buildYoBrowserUnavailablePayload("session-a", "Page.reload", browserStatus)),
    );

    const result = (await manager.callTool("cdp_send", { method: "Page.reload" }, "session-a")) as any;
    const payload = JSON.parse(result.content);

    expect(result.rawData.isError).toBe(true);
    expect(payload).toMatchObject({
      ok: false,
      error: {
        code: "yobrowser_unavailable",
        recoverable: true,
        sessionId: "session-a",
        method: "Page.reload",
        browserStatus,
      },
    });
    expect(result.rawData.toolResult).toMatchObject({
      ok: false,
      data: payload,
      error: {
        code: "yobrowser_unavailable",
        recoverable: true,
      },
    });
  });
});
