/**
 * Event system constant definitions
 *
 * Event names are grouped by functional domain using a consistent naming convention:
 * - Use a colon to separate the domain from the specific event
 * - Use lowercase with hyphens to join multiple words
 *
 * This may look like a duplicate of renderer/events.ts, but it is not: this file only covers main->renderer and main->main events
 */

// Configuration events
export const CONFIG_EVENTS = {
  PROVIDER_CHANGED: "config:provider-changed", // Replaces provider-setting-changed
  PROVIDER_ATOMIC_UPDATE: "config:provider-atomic-update", // New: atomic update of a single provider
  PROVIDER_BATCH_UPDATE: "config:provider-batch-update", // New: batch provider update
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
  COPY_WITH_COT_CHANGED: "config:copy-with-cot-enabled-changed",
  TRACE_DEBUG_CHANGED: "config:trace-debug-changed", // Trace debug toggle change event
  PROXY_RESOLVED: "config:proxy-resolved",
  LANGUAGE_CHANGED: "config:language-changed", // New: language change event
  // Model configuration events
  MODEL_CONFIG_CHANGED: "config:model-config-changed", // Model configuration change event
  MODEL_CONFIG_RESET: "config:model-config-reset", // Model configuration reset event
  MODEL_CONFIGS_IMPORTED: "config:model-configs-imported", // Model configuration batch import event
  FONT_FAMILY_CHANGED: "config:font-family-changed",
  CODE_FONT_FAMILY_CHANGED: "config:code-font-family-changed",
  // OAuth events
  OAUTH_LOGIN_START: "config:oauth-login-start", // OAuth login started
  OAUTH_LOGIN_SUCCESS: "config:oauth-login-success", // OAuth login succeeded
  OAUTH_LOGIN_ERROR: "config:oauth-login-error", // OAuth login failed
  THEME_CHANGED: "config:theme-changed", // Theme change event
  FONT_SIZE_CHANGED: "config:font-size-changed", // Font size change event
  DEFAULT_SYSTEM_PROMPT_CHANGED: "config:default-system-prompt-changed", // Default system prompt changed event
  CUSTOM_PROMPTS_CHANGED: "config:custom-prompts-changed", // Custom prompts change event
  NOWLEDGE_MEM_CONFIG_UPDATED: "config:nowledge-mem-config-updated", // Nowledge-mem configuration updated event
  DEFAULT_PROJECT_PATH_CHANGED: "config:default-project-path-changed",
  AGENTS_CHANGED: "config:agents-changed",
};

// Provider DB (aggregated JSON) events
export const PROVIDER_DB_EVENTS = {
  LOADED: "provider-db:loaded", // Initial load completed (built-in or cached)
  UPDATED: "provider-db:updated", // Remote refresh succeeded
};

// Conversation events
export const CONVERSATION_EVENTS = {
  LIST_UPDATED: "conversation:list-updated", // Pushes the full conversation list

  ACTIVATED: "conversation:activated", // Replaces conversation-activated
  DEACTIVATED: "conversation:deactivated", // Replaces active-conversation-cleared
  MESSAGE_EDITED: "conversation:message-edited", // Replaces message-edited
  SCROLL_TO_MESSAGE: "conversation:scroll-to-message",

  MESSAGE_GENERATED: "conversation:message-generated", // Internal main-process event: a complete message has been generated
};

// Streaming events
export const STREAM_EVENTS = {
  RESPONSE: "stream:response", // Replaces stream-response
  END: "stream:end", // Replaces stream-end
  ERROR: "stream:error", // Replaces stream-error
  PERMISSION_UPDATED: "stream:permission-updated", // Permission state updated; notifies the renderer to refresh the UI
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

// System events
export const SYSTEM_EVENTS = {
  SYSTEM_THEME_UPDATED: "system:theme-updated",
};

// App update events
export const UPDATE_EVENTS = {
  STATUS_CHANGED: "update:status-changed", // Replaces update-status-changed
  ERROR: "update:error", // Replaces update-error
  PROGRESS: "update:progress", // Download progress
  WILL_RESTART: "update:will-restart", // About to restart
  STATE_CHANGED: "update:state-changed", // Update state changed (used for lifecycle management communication)
};

// Daemon sidecar events
export const DAEMON_EVENTS = {
  SIDECAR_STATUS_CHANGED: "daemon:sidecar-status-changed",
  SIDECAR_PORT_ASSIGNED: "daemon:sidecar-port-assigned",
};

// Window events
export const WINDOW_EVENTS = {
  READY_TO_SHOW: "window:ready-to-show", // Replaces main-window-ready-to-show
  FORCE_QUIT_APP: "window:force-quit-app", // Replaces force-quit-app
  SET_APPLICATION_QUITTING: "window:set-application-quitting", // Marks the application as quitting
  APP_FOCUS: "app:focus",
  APP_BLUR: "app:blur",
  WINDOW_MAXIMIZED: "window:maximized",
  WINDOW_UNMAXIMIZED: "window:unmaximized",
  WINDOW_RESIZED: "window:resized",
  WINDOW_RESIZE: "window:resize",
  WINDOW_CLOSE: "window:close",
  WINDOW_CREATED: "window:created",
  WINDOW_FOCUSED: "window:focused",
  WINDOW_BLURRED: "window:blurred",
  WINDOW_ENTER_FULL_SCREEN: "window:enter-full-screen",
  WINDOW_LEAVE_FULL_SCREEN: "window:leave-full-screen",
  WINDOW_CLOSED: "window:closed",
  FIRST_CONTENT_LOADED: "window:first-content-loaded", // New: first content loaded event
  WINDOW_RESTORED: "window:restored",
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

// Ollama events
export const OLLAMA_EVENTS = {
  PULL_MODEL_PROGRESS: "ollama:pull-model-progress",
};

// MCP events
export const MCP_EVENTS = {
  SERVER_STARTED: "mcp:server-started",
  SERVER_STOPPED: "mcp:server-stopped",
  CONFIG_CHANGED: "mcp:config-changed",
  TOOL_CALL_RESULT: "mcp:tool-call-result",
  SERVER_STATUS_CHANGED: "mcp:server-status-changed",
  CLIENT_LIST_UPDATED: "mcp:client-list-updated",
  INITIALIZED: "mcp:initialized", // New: MCP initialization completed event
  SAMPLING_REQUEST: "mcp:sampling-request",
  SAMPLING_DECISION: "mcp:sampling-decision",
  SAMPLING_CANCELLED: "mcp:sampling-cancelled",
};

// Sync events
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

// Rate limit events
export const RATE_LIMIT_EVENTS = {
  CONFIG_UPDATED: "rate-limit:config-updated",
  REQUEST_QUEUED: "rate-limit:request-queued",
  REQUEST_EXECUTED: "rate-limit:request-executed",
  LIMIT_EXCEEDED: "rate-limit:limit-exceeded",
};

// DeepLink events
export const DEEPLINK_EVENTS = {
  PROTOCOL_RECEIVED: "deeplink:protocol-received",
  START: "deeplink:start",
  MCP_INSTALL: "deeplink:mcp-install",
};

// Notification events
export const NOTIFICATION_EVENTS = {
  SHOW_ERROR: "notification:show-error", // Show an error notification
  DATABASE_REPAIR_SUGGESTED: "notification:database-repair-suggested",
  SYS_NOTIFY_CLICKED: "notification:sys-notify-clicked", // System notification clicked event
  DATA_RESET_COMPLETE_DEV: "notification:data-reset-complete-dev", // Dev-only data reset complete notification
};

export const SHORTCUT_EVENTS = {
  ZOOM_IN: "shortcut:zoom-in",
  ZOOM_OUT: "shortcut:zoom-out",
  ZOOM_RESUME: "shortcut:zoom-resume",
  CREATE_NEW_WINDOW: "shortcut:create-new-window",
  CREATE_NEW_CONVERSATION: "shortcut:create-new-conversation",
  TOGGLE_SPOTLIGHT: "shortcut:toggle-spotlight",
  TOGGLE_SIDEBAR: "shortcut:toggle-sidebar",
  TOGGLE_WORKSPACE: "shortcut:toggle-workspace",
  GO_SETTINGS: "shortcut:go-settings",
  CLEAN_CHAT_HISTORY: "shortcut:clean-chat-history",
  DELETE_CONVERSATION: "shortcut:delete-conversation",
};

// Tab events
export const TAB_EVENTS = {
  TITLE_UPDATED: "tab:title-updated", // Tab title updated
  CONTENT_UPDATED: "tab:content-updated", // Tab content updated
  STATE_CHANGED: "tab:state-changed", // Tab state changed
  VISIBILITY_CHANGED: "tab:visibility-changed", // Tab visibility changed
  RENDERER_TAB_READY: "tab:renderer-ready", // Renderer tab ready
  RENDERER_TAB_ACTIVATED: "tab:renderer-activated", // Renderer tab activated
  CLOSED: "tab:closed", // Tab closed event
};

// Yo Browser events
export const YO_BROWSER_EVENTS = {
  OPEN_REQUESTED: "yo-browser:open-requested",
  WINDOW_CREATED: "yo-browser:window-created",
  WINDOW_UPDATED: "yo-browser:window-updated",
  WINDOW_CLOSED: "yo-browser:window-closed",
  WINDOW_FOCUSED: "yo-browser:window-focused",
  WINDOW_COUNT_CHANGED: "yo-browser:window-count-changed",
  WINDOW_VISIBILITY_CHANGED: "yo-browser:window-visibility-changed",
};

// Tray events
export const TRAY_EVENTS = {
  SHOW_HIDDEN_WINDOW: "tray:show-hidden-window", // Show/hide window from the tray
  CHECK_FOR_UPDATES: "tray:check-for-updates", // Check for updates from the tray
};

// Floating button events
export const FLOATING_BUTTON_EVENTS = {
  CLICKED: "floating-button:clicked", // Floating button clicked
  RIGHT_CLICKED: "floating-button:right-clicked", // Floating button right-clicked
  VISIBILITY_CHANGED: "floating-button:visibility-changed", // Floating button visibility changed
  POSITION_CHANGED: "floating-button:position-changed", // Floating button position changed
  ENABLED_CHANGED: "floating-button:enabled-changed", // Floating button enabled state changed
  HOVER_STATE_CHANGED: "floating-button:hover-state-changed",
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
  DRAG_START: "floating-button:drag-start", // Floating button drag started
  DRAG_MOVE: "floating-button:drag-move", // Floating button drag moved
  DRAG_END: "floating-button:drag-end", // Floating button drag ended
};

// Dialog related events
export const DIALOG_EVENTS = {
  REQUEST: "dialog:request", // Main -> Renderer: Request to show dialog
  RESPONSE: "dialog:response", // Renderer -> Main: Dialog result response
};

// Knowledge base events
export const RAG_EVENTS = {
  FILE_UPDATED: "rag:file-updated", // File status update
  FILE_PROGRESS: "rag:file-progress", // File processing progress update
};

// Lifecycle management events
export const LIFECYCLE_EVENTS = {
  PHASE_STARTED: "lifecycle:phase-started", // Lifecycle phase started
  PHASE_COMPLETED: "lifecycle:phase-completed", // Lifecycle phase completed
  HOOK_EXECUTED: "lifecycle:hook-executed", // Lifecycle hook executed start
  HOOK_COMPLETED: "lifecycle:hook-completed", // Lifecycle hook executed completed
  HOOK_FAILED: "lifecycle:hook-failed", // Lifecycle hook executed failed
  ERROR_OCCURRED: "lifecycle:error-occurred", // Lifecycle error occurred
  PROGRESS_UPDATED: "lifecycle:progress-updated", // Lifecycle progress updated
  SHUTDOWN_REQUESTED: "lifecycle:shutdown-requested", // Application shutdown requested
};

// Workspace events
export const WORKSPACE_EVENTS = {
  INVALIDATED: "workspace:files-changed", // Workspace invalidation event
  FILES_CHANGED: "workspace:files-changed", // Legacy alias
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

// Skills system events
export const SKILL_EVENTS = {
  DISCOVERED: "skill:discovered", // Skills discovery completed
  METADATA_UPDATED: "skill:metadata-updated", // Metadata hot-reload updated
  INSTALLED: "skill:installed", // Skill installation completed
  UNINSTALLED: "skill:uninstalled", // Skill uninstallation completed
  ACTIVATED: "skill:activated", // Skill activated in session
  DEACTIVATED: "skill:deactivated", // Skill deactivated in session
};

// Skill sync events (cross-tool synchronization)
export const SKILL_SYNC_EVENTS = {
  SCAN_STARTED: "skill-sync:scan-started", // Scan operation started
  SCAN_COMPLETED: "skill-sync:scan-completed", // Scan operation completed
  NEW_DISCOVERIES: "skill-sync:new-discoveries", // New skills discovered (after comparing with cache)
  IMPORT_STARTED: "skill-sync:import-started", // Import operation started
  IMPORT_PROGRESS: "skill-sync:import-progress", // Import progress update
  IMPORT_COMPLETED: "skill-sync:import-completed", // Import operation completed
  EXPORT_STARTED: "skill-sync:export-started", // Export operation started
  EXPORT_PROGRESS: "skill-sync:export-progress", // Export progress update
  EXPORT_COMPLETED: "skill-sync:export-completed", // Export operation completed
};
