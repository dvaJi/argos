import { describe, it, expect, vi } from "vitest";
import { dispatchConfigRoute } from "@argos/backend-core/dispatch/config/configRouteHandler";

function createMockConfigPresenter() {
  return {
    getLanguage: vi.fn<(...args: any[]) => any>().mockReturnValue("en"),
    setLanguage: vi.fn<(...args: any[]) => any>(),
    getTheme: vi.fn<(...args: any[]) => any>().mockResolvedValue("system"),
    setTheme: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
    getCurrentThemeIsDark: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
    getFloatingButtonEnabled: vi.fn<(...args: any[]) => any>().mockReturnValue(true),
    setFloatingButtonEnabled: vi.fn<(...args: any[]) => any>(),
    getDefaultProjectPath: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    setDefaultProjectPath: vi.fn<(...args: any[]) => any>(),
    getShortcutKey: vi.fn<(...args: any[]) => any>().mockReturnValue({}),
    setShortcutKey: vi.fn<(...args: any[]) => any>(),
    resetShortcutKeys: vi.fn<(...args: any[]) => any>(),
    getSyncEnabled: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    setSyncEnabled: vi.fn<(...args: any[]) => any>(),
    getSyncFolderPath: vi.fn<(...args: any[]) => any>().mockReturnValue(""),
    setSyncFolderPath: vi.fn<(...args: any[]) => any>(),
    getCustomPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    setCustomPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    addCustomPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateCustomPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    deleteCustomPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    setSystemPrompts: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    addSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    deleteSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getDefaultSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(""),
    setDefaultSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    resetToDefaultPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    clearSystemPrompt: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getDefaultSystemPromptId: vi.fn<(...args: any[]) => any>().mockResolvedValue(""),
    setDefaultSystemPromptId: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getSetting: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    setSetting: vi.fn<(...args: any[]) => any>(),
    getMcpServers: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
    getKnowledgeConfigs: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    setKnowledgeConfigs: vi.fn<(...args: any[]) => any>(),
    getAcpSharedMcpSelections: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    setAcpSharedMcpSelections: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    getAgentMcpSelections: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    listAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
    resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    getAcpRegistryIconMarkup: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    getVoiceAiConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({}),
    getGeminiSafety: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    getAwsBedrockCredential: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    getAzureApiVersion: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    getEntries: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    updateEntries: vi.fn<(...args: any[]) => any>(),
    supportsReasoningCapability: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    getReasoningPortrait: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    getThinkingBudgetRange: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    getTemperatureCapability: vi.fn<(...args: any[]) => any>().mockReturnValue(undefined),
    supportsTemperatureControl: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    supportsSearchCapability: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    getSearchDefaults: vi.fn<(...args: any[]) => any>().mockReturnValue(null),
    supportsAudioInputCapability: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
  } as any;
}

describe("dispatchConfigRoute", () => {
  it("dispatches config.getLanguage", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getLanguage", {});
    expect(result).toHaveProperty("requestedLanguage");
  });

  it("dispatches config.setLanguage", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.setLanguage", { language: "fr" });
    expect(config.setLanguage).toHaveBeenCalledWith("fr");
    expect(result).toHaveProperty("requestedLanguage");
  });

  it("dispatches config.getTheme", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getTheme", {});
    expect(result).toHaveProperty("theme", "system");
  });

  it("dispatches config.setTheme", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.setTheme", { theme: "dark" });
    expect(config.setTheme).toHaveBeenCalledWith("dark");
  });

  it("dispatches config.getFloatingButton", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getFloatingButton", {});
    expect(result).toHaveProperty("enabled", true);
  });

  it("dispatches config.setFloatingButton", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.setFloatingButton", { enabled: false });
    expect(config.setFloatingButtonEnabled).toHaveBeenCalledWith(false);
    expect(result).toHaveProperty("enabled");
  });

  it("dispatches config.getDefaultProjectPath", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getDefaultProjectPath", {});
    expect(result).toHaveProperty("path", null);
  });

  it("dispatches config.getShortcutKeys", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getShortcutKeys", {});
    expect(result).toHaveProperty("shortcuts");
  });

  it("dispatches config.getEntries", async () => {
    const config = createMockConfigPresenter();
    const result = await dispatchConfigRoute(config, "config.getEntries", {});
    expect(result).toHaveProperty("version");
    expect(result).toHaveProperty("values");
  });
});
