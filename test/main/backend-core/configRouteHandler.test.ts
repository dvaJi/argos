import { describe, it, expect, vi } from "vitest";
import { dispatchConfigRoute } from "@argos/backend-core/dispatch/config/configRouteHandler";

function createMockConfigPresenter() {
  return {
    getLanguage: vi.fn().mockReturnValue("en"),
    setLanguage: vi.fn(),
    getTheme: vi.fn().mockResolvedValue("system"),
    setTheme: vi.fn().mockResolvedValue(true),
    getCurrentThemeIsDark: vi.fn().mockResolvedValue(false),
    getFloatingButtonEnabled: vi.fn().mockReturnValue(true),
    setFloatingButtonEnabled: vi.fn(),
    getDefaultProjectPath: vi.fn().mockReturnValue(null),
    setDefaultProjectPath: vi.fn(),
    getShortcutKey: vi.fn().mockReturnValue({}),
    setShortcutKey: vi.fn(),
    resetShortcutKeys: vi.fn(),
    getSyncEnabled: vi.fn().mockReturnValue(false),
    setSyncEnabled: vi.fn(),
    getSyncFolderPath: vi.fn().mockReturnValue(""),
    setSyncFolderPath: vi.fn(),
    getCustomPrompts: vi.fn().mockResolvedValue([]),
    setCustomPrompts: vi.fn().mockResolvedValue(undefined),
    addCustomPrompt: vi.fn().mockResolvedValue(undefined),
    updateCustomPrompt: vi.fn().mockResolvedValue(undefined),
    deleteCustomPrompt: vi.fn().mockResolvedValue(undefined),
    getSystemPrompts: vi.fn().mockResolvedValue([]),
    setSystemPrompts: vi.fn().mockResolvedValue(undefined),
    addSystemPrompt: vi.fn().mockResolvedValue(undefined),
    updateSystemPrompt: vi.fn().mockResolvedValue(undefined),
    deleteSystemPrompt: vi.fn().mockResolvedValue(undefined),
    getDefaultSystemPrompt: vi.fn().mockResolvedValue(""),
    setDefaultSystemPrompt: vi.fn().mockResolvedValue(undefined),
    resetToDefaultPrompt: vi.fn().mockResolvedValue(undefined),
    clearSystemPrompt: vi.fn().mockResolvedValue(undefined),
    getDefaultSystemPromptId: vi.fn().mockResolvedValue(""),
    setDefaultSystemPromptId: vi.fn().mockResolvedValue(undefined),
    getSetting: vi.fn().mockReturnValue(undefined),
    setSetting: vi.fn(),
    getMcpServers: vi.fn().mockResolvedValue({}),
    getKnowledgeConfigs: vi.fn().mockReturnValue([]),
    setKnowledgeConfigs: vi.fn(),
    getAcpSharedMcpSelections: vi.fn().mockResolvedValue([]),
    setAcpSharedMcpSelections: vi.fn().mockResolvedValue(undefined),
    getAgentMcpSelections: vi.fn().mockResolvedValue([]),
    listAgents: vi.fn().mockResolvedValue([]),
    resolveDeepChatAgentConfig: vi.fn().mockResolvedValue(null),
    getAcpRegistryIconMarkup: vi.fn().mockResolvedValue(null),
    getVoiceAiConfig: vi.fn().mockReturnValue({}),
    getGeminiSafety: vi.fn().mockReturnValue(null),
    getAwsBedrockCredential: vi.fn().mockReturnValue(null),
    getAzureApiVersion: vi.fn().mockReturnValue(undefined),
    getEntries: vi.fn().mockReturnValue([]),
    updateEntries: vi.fn(),
    supportsReasoningCapability: vi.fn().mockReturnValue(false),
    getReasoningPortrait: vi.fn().mockReturnValue(null),
    getThinkingBudgetRange: vi.fn().mockReturnValue(null),
    getTemperatureCapability: vi.fn().mockReturnValue(undefined),
    supportsTemperatureControl: vi.fn().mockReturnValue(false),
    supportsSearchCapability: vi.fn().mockReturnValue(false),
    getSearchDefaults: vi.fn().mockReturnValue(null),
    supportsAudioInputCapability: vi.fn().mockReturnValue(false),
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
