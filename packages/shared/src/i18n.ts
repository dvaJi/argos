// Translation key-value type interface
export interface TranslationMap {
  [key: string]: string;
}

// Define supported languages
export const supportedLocales = ["en-US"];

// Context menu translations
export const contextMenuTranslations: Record<string, TranslationMap> = {
  "en-US": {
    copy: "Copy",
    paste: "Paste",
    cut: "Cut",
    selectAll: "Select All",
    undo: "Undo",
    redo: "Redo",
    saveImage: "Save Image...",
    copyImage: "Copy Image",
    open: "Open/Hide",
    checkForUpdates: "Check for Updates",
    quit: "Quit",
    translate: "Translate",
    askAI: "Ask AI",
    newThreadFromSelection: "New Thread from Selection",
    file: "File",
    edit: "Edit",
    view: "View",
    window: "Window",
    settings: "Settings...",
    newConversation: "New Conversation",
    newWindow: "New Window",
    closeWindow: "Close Window",
    quickSearch: "Quick Search",
    toggleSidebar: "Toggle Sidebar",
    toggleWorkspace: "Toggle Workspace",
    cleanChatHistory: "Clear Chat History",
    deleteConversation: "Delete Conversation",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetZoom: "Actual Size",
    showHide: "Show/Hide Argos",
  },
};

// Error message translations
export const errorMessageTranslations: Record<string, TranslationMap> = {
  "en-US": {
    mcpConnectionErrorTitle: "MCP Connection Error",
    mcpConnectionErrorMessage: "Failed to connect to MCP server",
    addMcpServerErrorTitle: "Failed to Add Server",
    addMcpServerDuplicateMessage: 'Server name "{serverName}" already exists. Please choose a different name.',
    getMcpToolListErrorTitle: "Failed to Get Tool Definitions",
    getMcpToolListErrorMessage: "Unable to retrieve tool list from server '{serverName}': {errorMessage}",
    genericErrorTitle: "Error",
    genericErrorMessage: "An error occurred",
    needRagflowConfig: "RAGFlow knowledge base configuration is required",
    needDifyConfig: "Dify knowledge base configuration is required",
    needAtLeastOneRagflowConfig: "At least one RAGFlow knowledge base configuration is required",
    needAtLeastOneDifyConfig: "At least one Dify knowledge base configuration is required",
    needRagflowApiKey: "RAGFlow API Key is required",
    needDifyApiKey: "Dify API Key is required",
    needRagflowDatasetIds: "At least one RAGFlow Dataset ID is required",
    needDifyDatasetId: "Dify Dataset ID is required",
    needRagflowEndpoint: "RAGFlow Endpoint is required",
    needDifyEndpoint: "Dify Endpoint is required",
    needKnowledgeBaseDescription:
      "A description of this knowledge base is required so the AI can decide whether to retrieve from it",
  },
};

/**
 * Get the best matching translation based on language code.
 */
export function getBestMatchTranslation(locale: string, translations: Record<string, TranslationMap>): TranslationMap {
  return translations[locale] || translations["en-US"];
}

/**
 * Get context menu translations.
 */
export function getContextMenuLabels(locale: string): TranslationMap {
  return getBestMatchTranslation(locale, contextMenuTranslations);
}

/**
 * Get error message translations.
 */
export function getErrorMessageLabels(locale: string): TranslationMap {
  return getBestMatchTranslation(locale, errorMessageTranslations);
}
