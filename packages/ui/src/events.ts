/**
 * Event system constant definitions
 * This may look duplicated with main/events.ts, but it isn't: this file only contains events pushed from main to renderer
 *
 * Event names are grouped by functional domain using a unified naming convention:
 * - Use a colon to separate the domain from the specific event
 * - Use lowercase and hyphens to join multiple words
 */

// Configuration-related events
export const CONFIG_EVENTS = {
  PROVIDER_CHANGED: "config:provider-changed", // Replaces provider-setting-changed
  PROVIDER_ATOMIC_UPDATE: "config:provider-atomic-update", // Atomic update for a single provider
  PROVIDER_BATCH_UPDATE: "config:provider-batch-update", // Batch provider update
  MODEL_LIST_CHANGED: "config:model-list-changed", // Replaces provider-models-updated (ConfigPresenter)
  MODEL_STATUS_CHANGED: "config:model-status-changed", // Replaces model-status-changed (ConfigPresenter)
  MODEL_BATCH_STATUS_CHANGED: "config:model-batch-status-changed", // Batch model status change event
  SETTING_CHANGED: "config:setting-changed", // Replaces setting-changed (ConfigPresenter)
  PROXY_MODE_CHANGED: "config:proxy-mode-changed",
  CUSTOM_PROXY_URL_CHANGED: "config:custom-proxy-url-changed",
  SYNC_SETTINGS_CHANGED: "config:sync-settings-changed",
  SEARCH_ENGINES_UPDATED: "config:search-engines-updated",
  SEARCH_PREVIEW_CHANGED: "config:search-preview-changed",
  AUTO_SCROLL_CHANGED: "config:auto-scroll-changed",
  NOTIFICATIONS_CHANGED: "config:notifications-changed",
  CONTENT_PROTECTION_CHANGED: "config:content-protection-changed",
  LANGUAGE_CHANGED: "config:language-changed", // New: language change event
  COPY_WITH_COT_CHANGED: "config:copy-with-cot-enabled-changed",
  TRACE_DEBUG_CHANGED: "config:trace-debug-changed", // Trace debug toggle change event
  FONT_FAMILY_CHANGED: "config:font-family-changed",
  CODE_FONT_FAMILY_CHANGED: "config:code-font-family-changed",
  THEME_CHANGED: "config:theme-changed",
  FONT_SIZE_CHANGED: "config:font-size-changed",
  DEFAULT_SYSTEM_PROMPT_CHANGED: "config:default-system-prompt-changed",
  CUSTOM_PROMPTS_CHANGED: "config:custom-prompts-changed",
  DEFAULT_PROJECT_PATH_CHANGED: "config:default-project-path-changed",
  AGENTS_CHANGED: "config:agents-changed",
};

// Conversation-related events
export const CONVERSATION_EVENTS = {
  LIST_UPDATED: "conversation:list-updated", // New: used to push the full conversation list

  ACTIVATED: "conversation:activated", // Replaces conversation-activated
  DEACTIVATED: "conversation:deactivated", // Replaces active-conversation-cleared
  MESSAGE_EDITED: "conversation:message-edited", // Replaces message-edited
  SCROLL_TO_MESSAGE: "conversation:scroll-to-message",
};

// Streaming-related events
export const STREAM_EVENTS = {
  RESPONSE: "stream:response", // Replaces stream-response
  END: "stream:end", // Replaces stream-end
  ERROR: "stream:error", // Replaces stream-error
  PERMISSION_UPDATED: "stream:permission-updated", // Permission state updated; notifies renderer to refresh UI
};

// App update-related events
export const UPDATE_EVENTS = {
  STATUS_CHANGED: "update:status-changed", // Replaces update-status-changed
  ERROR: "update:error", // Replaces update-error
  PROGRESS: "update:progress", // Download progress
  WILL_RESTART: "update:will-restart", // About to restart
};

// Window-related events
export const WINDOW_EVENTS = {
  READY_TO_SHOW: "window:ready-to-show", // Replaces main-window-ready-to-show
  FORCE_QUIT_APP: "window:force-quit-app", // Replaces force-quit-app
  APP_FOCUS: "app:focus",
  APP_BLUR: "app:blur",
  WINDOW_MAXIMIZED: "window:maximized",
  WINDOW_UNMAXIMIZED: "window:unmaximized",
  WINDOW_ENTER_FULL_SCREEN: "window:enter-full-screen",
  WINDOW_LEAVE_FULL_SCREEN: "window:leave-full-screen",
};

export const APP_RUNTIME_EVENTS = {
  WINDOW_FOCUSED: "window-focused",
  WINDOW_BLURRED: "window-blurred",
};

// Settings related events
export const SETTINGS_EVENTS = {
  READY: "settings:ready",
  NAVIGATE: "settings:navigate",
  CHECK_FOR_UPDATES: "settings:check-for-updates",
  PROVIDER_INSTALL: "settings:provider-install",
};

export const DEV_EVENTS = {
  START_GUIDED_ONBOARDING: "dev:start-guided-onboarding",
};

// Ollama-related events
export const OLLAMA_EVENTS = {
  PULL_MODEL_PROGRESS: "ollama:pull-model-progress",
};
// MCP-related events
export const MCP_EVENTS = {
  SERVER_STARTED: "mcp:server-started",
  SERVER_STOPPED: "mcp:server-stopped",
  CONFIG_CHANGED: "mcp:config-changed",
  TOOL_CALL_RESULT: "mcp:tool-call-result",
  SERVER_STATUS_CHANGED: "mcp:server-status-changed",
  SAMPLING_REQUEST: "mcp:sampling-request",
  SAMPLING_DECISION: "mcp:sampling-decision",
  SAMPLING_CANCELLED: "mcp:sampling-cancelled",
};

// Sync-related events
export const SYNC_EVENTS = {
  BACKUP_STARTED: "sync:backup-started",
  BACKUP_COMPLETED: "sync:backup-completed",
  BACKUP_ERROR: "sync:backup-error",
  BACKUP_STATUS_CHANGED: "sync:backup-status-changed",
  IMPORT_STARTED: "sync:import-started",
  IMPORT_COMPLETED: "sync:import-completed",
  IMPORT_ERROR: "sync:import-error",
  DATA_CHANGED: "sync:data-changed",
};

// Rate limit-related events
export const RATE_LIMIT_EVENTS = {
  CONFIG_UPDATED: "rate-limit:config-updated",
  REQUEST_QUEUED: "rate-limit:request-queued",
  REQUEST_EXECUTED: "rate-limit:request-executed",
  LIMIT_EXCEEDED: "rate-limit:limit-exceeded",
};

// DeepLink-related events
export const DEEPLINK_EVENTS = {
  PROTOCOL_RECEIVED: "deeplink:protocol-received",
  START: "deeplink:start",
  MCP_INSTALL: "deeplink:mcp-install",
};

// Global notification-related events
export const NOTIFICATION_EVENTS = {
  SHOW_ERROR: "notification:show-error", // Show error notification
  DATABASE_REPAIR_SUGGESTED: "notification:database-repair-suggested",
  SYS_NOTIFY_CLICKED: "notification:sys-notify-clicked", // System notification click event
  DATA_RESET_COMPLETE_DEV: "notification:data-reset-complete-dev", // Dev environment data reset complete notification
};

export const PROVIDER_DB_EVENTS = {
  LOADED: "provider-db:loaded",
  UPDATED: "provider-db:updated",
};
export const SHORTCUT_EVENTS = {
  ZOOM_IN: "shortcut:zoom-in",
  ZOOM_OUT: "shortcut:zoom-out",
  ZOOM_RESUME: "shortcut:zoom-resume",
  CREATE_NEW_CONVERSATION: "shortcut:create-new-conversation",
  TOGGLE_SPOTLIGHT: "shortcut:toggle-spotlight",
  TOGGLE_SIDEBAR: "shortcut:toggle-sidebar",
  TOGGLE_WORKSPACE: "shortcut:toggle-workspace",
  GO_SETTINGS: "shortcut:go-settings",
  CLEAN_CHAT_HISTORY: "shortcut:clean-chat-history",
  DELETE_CONVERSATION: "shortcut:delete-conversation",
};

// Thread view related events
export const THREAD_VIEW_EVENTS = {
  TOGGLE: "thread-view:toggle",
};

// Tab-related events
export const TAB_EVENTS = {
  TITLE_UPDATED: "tab:title-updated", // Tab title updated
  CONTENT_UPDATED: "tab:content-updated", // Tab content updated
  STATE_CHANGED: "tab:state-changed", // Tab state changed
  VISIBILITY_CHANGED: "tab:visibility-changed", // Tab visibility changed
  RENDERER_TAB_READY: "tab:renderer-ready", // Renderer tab ready
  RENDERER_TAB_ACTIVATED: "tab:renderer-activated", // Renderer tab activated
};

// Yo Browser-related events
export const YO_BROWSER_EVENTS = {
  OPEN_REQUESTED: "yo-browser:open-requested",
  WINDOW_CREATED: "yo-browser:window-created",
  WINDOW_UPDATED: "yo-browser:window-updated",
  WINDOW_CLOSED: "yo-browser:window-closed",
  WINDOW_FOCUSED: "yo-browser:window-focused",
  WINDOW_COUNT_CHANGED: "yo-browser:window-count-changed",
  WINDOW_VISIBILITY_CHANGED: "yo-browser:window-visibility-changed",
};

// Skills-related events
export const SKILL_EVENTS = {
  ACTIVATED: "skill:activated",
  DEACTIVATED: "skill:deactivated",
};

// Skill sync events (cross-tool synchronization)
export const SKILL_SYNC_EVENTS = {
  NEW_DISCOVERIES: "skill-sync:new-discoveries", // New skills discovered
};

// Floating button-related events
export const FLOATING_BUTTON_EVENTS = {
  CLICKED: "floating-button:clicked", // Floating button clicked
  RIGHT_CLICKED: "floating-button:right-clicked", // Floating button right-clicked
  VISIBILITY_CHANGED: "floating-button:visibility-changed", // Floating button visibility changed
  POSITION_CHANGED: "floating-button:position-changed", // Floating button position changed
  ENABLED_CHANGED: "floating-button:enabled-changed", // Floating button enabled state changed
  SNAPSHOT_REQUEST: "floating-button:snapshot-request",
  SNAPSHOT_UPDATED: "floating-button:snapshot-updated",
  LANGUAGE_REQUEST: "floating-button:language-request",
  LANGUAGE_CHANGED: "floating-button:language-changed",
  THEME_REQUEST: "floating-button:theme-request",
  THEME_CHANGED: "floating-button:theme-changed",
  ACP_REGISTRY_ICON_REQUEST: "floating-button:acp-registry-icon-request",
  TOGGLE_EXPANDED: "floating-button:toggle-expanded",
  SET_EXPANDED: "floating-button:set-expanded",
  OPEN_SESSION: "floating-button:open-session",
  DRAG_START: "floating-button:drag-start",
  DRAG_MOVE: "floating-button:drag-move",
  DRAG_END: "floating-button:drag-end",
};

// Dialog-related events
export const DIALOG_EVENTS = {
  REQUEST: "dialog:request", // Main process -> renderer: request to show dialog
  RESPONSE: "dialog:response", // Renderer -> main process: dialog result returned
};

// Knowledge base events
export const RAG_EVENTS = {
  FILE_UPDATED: "rag:file-updated", // File status updated
  FILE_PROGRESS: "rag:file-progress", // File progress updated
};
// New agent session events
export const SESSION_EVENTS = {
  LIST_UPDATED: "session:list-updated",
  ACTIVATED: "session:activated",
  DEACTIVATED: "session:deactivated",
  STATUS_CHANGED: "session:status-changed",
  COMPACTION_UPDATED: "session:compaction-updated",
  PENDING_INPUTS_UPDATED: "session:pending-inputs-updated",
};

// System-related events
export const SYSTEM_EVENTS = {
  SYSTEM_THEME_UPDATED: "system:theme-updated",
};

// Workspace events
export const WORKSPACE_EVENTS = {
  INVALIDATED: "workspace:files-changed", // Workspace invalidation event
  FILES_CHANGED: "workspace:files-changed", // Legacy alias
  INSERT_REFERENCE_REQUESTED: "workspace:insert-reference-requested",
};

// ACP-specific workspace events
export const ACP_WORKSPACE_EVENTS = {
  SESSION_MODES_READY: "acp-workspace:session-modes-ready", // Session modes available
  SESSION_COMMANDS_READY: "acp-workspace:session-commands-ready", // Session commands available
  SESSION_CONFIG_OPTIONS_READY: "acp-workspace:session-config-options-ready", // Session config options available
};

export const ACP_DEBUG_EVENTS = {
  EVENT: "acp-debug:event",
};
