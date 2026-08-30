import { type FC, type FormEvent, type Dispatch, useState, useReducer } from "react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import type { MCPServerConfig } from "@argos/shared/presenter";
import { EmojiPicker } from "#/components/emoji-picker";
import { useToast } from "#/components/use-toast";
import { Icon } from "@iconify/react";
import { X } from "lucide-react";
import { createDeviceClient } from "#api/DeviceClient";
import { nanoid } from "nanoid";
import { Checkbox } from "#shadcn/components/ui/checkbox";
type MCPServerTypeOption = "sse" | "stdio" | "inmemory" | "http";
const VALID_MCP_TYPES: MCPServerTypeOption[] = ["stdio", "sse", "http", "inmemory"];
interface McpServerFormProps {
  serverName?: string;
  initialConfig?: MCPServerConfig;
  editMode?: boolean;
  defaultJsonConfig?: string;
  onSubmit: (serverName: string, config: MCPServerConfig) => void;
}
const placeholder = `MCP config example:
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", ...]
    }
  }
}`;
const customHeadersPlaceholder = `Authorization=Bearer your_token
HTTP-Referer=argos.aipurrjects.xyz`;
const formatJsonHeaders = (headers: Record<string, string>): string =>
  Object.entries(headers)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
const validateKeyValueHeaders = (text: string): boolean => {
  if (!text.trim()) return true;
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const parts = trimmedLine.split("=");
    if (parts.length < 2 || !parts[0].trim()) return false;
  }
  return true;
};
const parseKeyValueHeaders = (text: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (!text) return headers;
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex > 0) {
      const key = trimmedLine.substring(0, separatorIndex).trim();
      const value = trimmedLine.substring(separatorIndex + 1).trim();
      if (key) headers[key] = value;
    }
  }
  return headers;
};
const maskSensitiveValue = (value: string): string =>
  value.replace(/=(.+)/g, (_, val) => {
    const trimmedVal = val.trim();
    if (trimmedVal.length <= 4) return "=" + "*".repeat(trimmedVal.length);
    if (trimmedVal.length <= 12) return "=" + trimmedVal.substring(0, 1) + "*".repeat(6);
    return "=" + trimmedVal.substring(0, 2) + "*".repeat(8) + trimmedVal.substring(trimmedVal.length - 2);
  });
const createArgsRows = (values: string[]) =>
  values.map((value) => ({
    id: nanoid(),
    value,
  }));
type McpServerFormState = {
  name: string;
  command: string;
  env: string;
  descriptions: string;
  icons: string;
  type: MCPServerTypeOption;
  baseUrl: string;
  customHeaders: string;
  autoApproveAll: boolean;
  autoApproveRead: boolean;
  autoApproveWrite: boolean;
  argsRows: Array<{
    id: string;
    value: string;
  }>;
  foldersList: string[];
  currentStep: "simple" | "detailed";
};
type McpServerFormAction =
  | { type: "SET_NAME"; value: string }
  | { type: "SET_COMMAND"; value: string }
  | { type: "SET_ENV"; value: string }
  | { type: "SET_DESCRIPTIONS"; value: string }
  | { type: "SET_ICONS"; value: string }
  | { type: "SET_TYPE"; value: MCPServerTypeOption }
  | { type: "SET_BASE_URL"; value: string }
  | { type: "SET_CUSTOM_HEADERS"; value: string }
  | { type: "SET_CURRENT_STEP"; value: "simple" | "detailed" }
  | { type: "SET_AUTO_APPROVE_ALL"; value: boolean }
  | { type: "SET_AUTO_APPROVE_READ"; value: boolean }
  | { type: "SET_AUTO_APPROVE_WRITE"; value: boolean }
  | { type: "ADD_ARGS_ROW"; id: string }
  | { type: "REMOVE_ARGS_ROW"; id: string }
  | { type: "UPDATE_ARGS_ROW"; id: string; value: string }
  | { type: "ADD_FOLDER"; path: string }
  | { type: "REMOVE_FOLDER"; index: number }
  | {
      type: "IMPORT_SERVER_CONFIG";
      name: string;
      command: string;
      env: string;
      descriptions: string;
      icons: string;
      serverType: MCPServerTypeOption;
      baseUrl: string;
      customHeaders: string;
      autoApproveAll: boolean;
      autoApproveRead: boolean;
      autoApproveWrite: boolean;
      argsRows: Array<{
        id: string;
        value: string;
      }>;
      foldersList: string[];
    };
const createInitialMcpServerFormState = (
  serverName: string | undefined,
  initialConfig: MCPServerConfig | undefined,
  editMode: boolean,
): McpServerFormState => {
  const initialArgs = Array.isArray(initialConfig?.args) ? initialConfig.args : [];
  return {
    name: serverName || "",
    command: initialConfig?.command || "npx",
    env: JSON.stringify(initialConfig?.env || {}, null, 2),
    descriptions: initialConfig?.descriptions || "",
    icons: initialConfig?.icons || "📁",
    type: (initialConfig?.type as MCPServerTypeOption | undefined) || "stdio",
    baseUrl: initialConfig?.baseUrl || "",
    customHeaders: initialConfig?.customHeaders ? formatJsonHeaders(initialConfig.customHeaders) : "",
    autoApproveAll: initialConfig?.autoApprove?.includes("all") || false,
    autoApproveRead:
      initialConfig?.autoApprove?.includes("read") || initialConfig?.autoApprove?.includes("all") || false,
    autoApproveWrite:
      initialConfig?.autoApprove?.includes("write") || initialConfig?.autoApprove?.includes("all") || false,
    argsRows: createArgsRows(initialArgs),
    foldersList: [...initialArgs],
    currentStep: editMode ? "detailed" : "simple",
  };
};
const mcpServerFormReducer = (state: McpServerFormState, action: McpServerFormAction): McpServerFormState => {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.value };
    case "SET_COMMAND":
      return { ...state, command: action.value };
    case "SET_ENV":
      return { ...state, env: action.value };
    case "SET_DESCRIPTIONS":
      return { ...state, descriptions: action.value };
    case "SET_ICONS":
      return { ...state, icons: action.value };
    case "SET_TYPE":
      return { ...state, type: action.value };
    case "SET_BASE_URL":
      return { ...state, baseUrl: action.value };
    case "SET_CUSTOM_HEADERS":
      return { ...state, customHeaders: action.value };
    case "SET_CURRENT_STEP":
      return { ...state, currentStep: action.value };
    case "SET_AUTO_APPROVE_ALL":
      return action.value
        ? { ...state, autoApproveAll: true, autoApproveRead: true, autoApproveWrite: true }
        : { ...state, autoApproveAll: false };
    case "SET_AUTO_APPROVE_READ":
      return { ...state, autoApproveRead: action.value };
    case "SET_AUTO_APPROVE_WRITE":
      return { ...state, autoApproveWrite: action.value };
    case "ADD_ARGS_ROW":
      return {
        ...state,
        argsRows: [
          ...state.argsRows,
          {
            id: action.id,
            value: "",
          },
        ],
      };
    case "REMOVE_ARGS_ROW":
      return { ...state, argsRows: state.argsRows.filter((row) => row.id !== action.id) };
    case "UPDATE_ARGS_ROW":
      return {
        ...state,
        argsRows: state.argsRows.map((row) => (row.id === action.id ? { ...row, value: action.value } : row)),
      };
    case "ADD_FOLDER":
      return { ...state, foldersList: [...state.foldersList, action.path] };
    case "REMOVE_FOLDER":
      return { ...state, foldersList: state.foldersList.filter((_, i) => i !== action.index) };
    case "IMPORT_SERVER_CONFIG":
      return {
        ...state,
        name: action.name,
        command: action.command,
        env: action.env,
        descriptions: action.descriptions,
        icons: action.icons,
        type: action.serverType,
        baseUrl: action.baseUrl,
        customHeaders: action.customHeaders,
        autoApproveAll: action.autoApproveAll,
        autoApproveRead: action.autoApproveRead,
        autoApproveWrite: action.autoApproveWrite,
        argsRows: action.argsRows,
        foldersList: action.foldersList,
        currentStep: "detailed",
      };
  }
};
const McpServerForm: FC<McpServerFormProps> = ({
  serverName: serverNameProp,
  initialConfig,
  editMode = false,
  defaultJsonConfig,
  onSubmit,
}) => {
  const { toast } = useToast();
  const deviceClient = createDeviceClient();
  const [form, dispatchForm] = useReducer(mcpServerFormReducer, undefined, () =>
    createInitialMcpServerFormState(serverNameProp, initialConfig, editMode),
  );
  const [customHeadersFocused, setCustomHeadersFocused] = useState(false);
  const [npmRegistry, setNpmRegistry] = useState(initialConfig?.customNpmRegistry || "");
  const [jsonConfig, setJsonConfig] = useState("");
  // Mirror the incoming `defaultJsonConfig` prop into the editable jsonConfig
  // state (prev-compare during render — no effect needed).
  const [syncedDefaultJsonConfig, setSyncedDefaultJsonConfig] = useState(defaultJsonConfig);
  if (syncedDefaultJsonConfig !== defaultJsonConfig) {
    setSyncedDefaultJsonConfig(defaultJsonConfig);
    if (defaultJsonConfig) {
      setJsonConfig(defaultJsonConfig);
    }
  }
  const isInMemoryType = form.type === "inmemory";
  const isBuildInFileSystem = isInMemoryType && form.name === "buildInFileSystem";
  const isHttpTransportType = form.type === "http";
  const isRemoteType = form.type === "sse" || isHttpTransportType;
  const isFieldReadOnly = editMode && isInMemoryType;
  const showBaseUrl = isRemoteType;
  const showCommandFields = form.type === "stdio";
  const showArgsInput = showCommandFields || (isInMemoryType && !isBuildInFileSystem);
  const showFolderSelector = isBuildInFileSystem;
  const showNpmRegistryInput = form.type === "stdio" && ["npx", "node"].includes(form.command.toLowerCase());
  const addArgsRow = () => dispatchForm({ type: "ADD_ARGS_ROW", id: nanoid() });
  const removeArgsRow = (id: string) => dispatchForm({ type: "REMOVE_ARGS_ROW", id });
  const handleArgsRowChange = (id: string, value: string) => dispatchForm({ type: "UPDATE_ARGS_ROW", id, value });
  const addFolder = async () => {
    try {
      const result = await deviceClient.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        if (!form.foldersList.includes(selectedPath)) {
          dispatchForm({ type: "ADD_FOLDER", path: selectedPath });
        }
      }
    } catch (error) {
      console.error("Folder select error:", error);
      toast({
        title: "Select Folder Error",
        description: String(error),
        variant: "destructive",
      });
    }
  };
  const removeFolder = (index: number) => dispatchForm({ type: "REMOVE_FOLDER", index });
  const isNameValid = form.name.trim().length > 0;
  const isCommandValid = (() => {
    if (isRemoteType) return true;
    if (form.type === "stdio" || isInMemoryType) return form.command.trim().length > 0;
    return true;
  })();
  const isEnvValid = (() => {
    try {
      if (!form.env.trim()) return true;
      JSON.parse(form.env);
      return true;
    } catch {
      return false;
    }
  })();
  const isBaseUrlValid = !isRemoteType || form.baseUrl.trim().length > 0;
  const isCustomHeadersFormatValid = validateKeyValueHeaders(form.customHeaders);
  const isFormValid = (() => {
    if (!isNameValid) return false;
    if (isRemoteType) return isNameValid && isBaseUrlValid && isCustomHeadersFormatValid;
    return isNameValid && isCommandValid && isEnvValid;
  })();
  const customHeadersDisplayValue = (() => {
    if (customHeadersFocused || !form.customHeaders.trim()) {
      return form.customHeaders;
    }
    return form.customHeaders
      .split("\n")
      .map((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.includes("=")) return line;
        return maskSensitiveValue(line);
      })
      .join("\n");
  })();
  const parseJsonConfig = () => {
    const reportParseError = (error: unknown) => {
      console.error("Parse error:", error);
      toast({
        title: "Parse Error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    };
    try {
      const parsedConfig = JSON.parse(jsonConfig);
      if (!parsedConfig.mcpServers || typeof parsedConfig.mcpServers !== "object") {
        reportParseError(new Error("Invalid format"));
        return;
      }
      const serverEntries = Object.entries(parsedConfig.mcpServers);
      if (serverEntries.length === 0) {
        reportParseError(new Error("No servers found"));
        return;
      }
      const [serverName, serverConfig] = serverEntries[0] as [string, any];
      const incomingArgs = Array.isArray(serverConfig.args) ? serverConfig.args : [];
      const incomingType = serverConfig.type as MCPServerTypeOption | undefined;
      const url = serverConfig.url || serverConfig.baseUrl || "";
      const fallbackType: MCPServerTypeOption = url ? "http" : "stdio";
      const headersFromConfig = serverConfig.customHeaders || serverConfig.headers;
      dispatchForm({
        type: "IMPORT_SERVER_CONFIG",
        name: serverName,
        command: serverConfig.command || "npx",
        env: JSON.stringify(serverConfig.env || {}, null, 2),
        descriptions: serverConfig.descriptions || "",
        icons: serverConfig.icons || "📁",
        argsRows: createArgsRows(incomingArgs),
        foldersList: incomingArgs,
        baseUrl: url,
        serverType: incomingType && VALID_MCP_TYPES.includes(incomingType) ? incomingType : fallbackType,
        customHeaders: headersFromConfig ? formatJsonHeaders(headersFromConfig) : "",
        autoApproveAll: serverConfig.autoApprove?.includes("all") || false,
        autoApproveRead:
          serverConfig.autoApprove?.includes("read") || serverConfig.autoApprove?.includes("all") || false,
        autoApproveWrite:
          serverConfig.autoApprove?.includes("write") || serverConfig.autoApprove?.includes("all") || false,
      });
      toast({
        title: "Parse Success",
        description: "Configuration imported",
      });
    } catch (error) {
      reportParseError(error);
    }
  };
  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isFormValid) return;
    const autoApprove: string[] = [];
    if (form.autoApproveAll) {
      autoApprove.push("all");
    } else {
      if (form.autoApproveRead) autoApprove.push("read");
      if (form.autoApproveWrite) autoApprove.push("write");
    }
    const baseConfig = {
      descriptions: form.descriptions.trim(),
      icons: form.icons.trim(),
      autoApprove,
      type: form.type,
      enabled: initialConfig?.enabled ?? false,
    };
    let parsedEnv = {};
    try {
      if ((form.type === "stdio" || isInMemoryType) && form.env.trim()) parsedEnv = JSON.parse(form.env);
    } catch (error) {
      toast({
        title: "JSON Parse Error",
        description: String(error),
        variant: "destructive",
      });
      return;
    }
    let parsedCustomHeaders = {};
    try {
      if (isRemoteType && form.customHeaders.trim()) parsedCustomHeaders = parseKeyValueHeaders(form.customHeaders);
    } catch (error) {
      toast({
        title: "Parse Error",
        description: "Invalid headers: " + String(error),
        variant: "destructive",
      });
      return;
    }
    let serverConfig: MCPServerConfig;
    if (isRemoteType) {
      serverConfig = {
        ...baseConfig,
        command: "",
        args: [],
        env: {},
        baseUrl: form.baseUrl.trim(),
        customHeaders: parsedCustomHeaders,
      };
    } else {
      const normalizedArgs = isBuildInFileSystem
        ? form.foldersList.filter((folder) => folder.trim().length > 0)
        : form.argsRows.flatMap((row) => {
            const value = row.value.trim();
            return value.length > 0 ? [value] : [];
          });
      serverConfig = {
        ...baseConfig,
        command: form.command.trim(),
        args: normalizedArgs,
        env: parsedEnv,
        baseUrl: form.baseUrl.trim(),
      };
    }
    if (serverConfig.customHeaders) {
      dispatchForm({ type: "SET_CUSTOM_HEADERS", value: formatJsonHeaders(serverConfig.customHeaders) });
    }
    if (showNpmRegistryInput && npmRegistry.trim()) {
      serverConfig.customNpmRegistry = npmRegistry.trim();
    } else {
      serverConfig.customNpmRegistry = "";
    }
    onSubmit(form.name.trim(), serverConfig);
  };
  if (form.currentStep === "simple") {
    return (
      <McpJsonImportStep
        jsonConfig={jsonConfig}
        onJsonConfigChange={setJsonConfig}
        onParse={parseJsonConfig}
        onManualSetup={() => dispatchForm({ type: "SET_CURRENT_STEP", value: "detailed" })}
      />
    );
  }
  return (
    <form className="space-y-2 h-full flex flex-col" onSubmit={handleSubmit}>
      <ScrollArea className="h-0 grow">
        <div className="space-y-2 px-4 pb-4">
          <McpServerIdentityFields
            form={form}
            dispatchForm={dispatchForm}
            editMode={editMode}
            isFieldReadOnly={isFieldReadOnly}
            showInMemoryOption={editMode && initialConfig?.type === "inmemory"}
          />

          <McpServerTransportFields
            form={form}
            dispatchForm={dispatchForm}
            isFieldReadOnly={isFieldReadOnly}
            showBaseUrl={showBaseUrl}
            showCommandField={showCommandFields}
            showFoldersField={showFolderSelector}
            showArgsField={!showFolderSelector && showArgsInput}
            showEnvField={showCommandFields || isInMemoryType}
            isEnvValid={isEnvValid}
            onAddFolder={addFolder}
            onRemoveFolder={removeFolder}
            onAddArgsRow={addArgsRow}
            onRemoveArgsRow={removeArgsRow}
            onArgsRowChange={handleArgsRowChange}
          />

          <McpServerExtraFields
            form={form}
            dispatchForm={dispatchForm}
            isFieldReadOnly={isFieldReadOnly}
            showBaseUrl={showBaseUrl}
            showNpmRegistryInput={showNpmRegistryInput}
            npmRegistry={npmRegistry}
            onNpmRegistryChange={setNpmRegistry}
            customHeadersFocused={customHeadersFocused}
            onCustomHeadersFocus={() => setCustomHeadersFocused(true)}
            onCustomHeadersBlur={() => setCustomHeadersFocused(false)}
            customHeadersDisplayValue={customHeadersDisplayValue}
            isCustomHeadersFormatValid={isCustomHeadersFormatValid}
          />
        </div>
      </ScrollArea>

      <div className="flex justify-end pt-2 border-t px-4">
        <Button type="submit" size="sm" disabled={!isFormValid}>
          Save
        </Button>
      </div>
    </form>
  );
};
const McpJsonImportStep = ({
  jsonConfig,
  onJsonConfigChange,
  onParse,
  onManualSetup,
}: {
  jsonConfig: string;
  onJsonConfigChange: (value: string) => void;
  onParse: () => void;
  onManualSetup: () => void;
}) => (
  <form className="space-y-4 h-full flex flex-col">
    <ScrollArea className="h-0 grow">
      <div className="space-y-4 px-4 pb-4">
        <div className="text-sm">Paste your MCP server JSON configuration below.</div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="json-config">
            JSON Configuration
          </Label>
          <Textarea
            id="json-config"
            value={jsonConfig}
            onChange={(e) => onJsonConfigChange(e.target.value)}
            rows={10}
            placeholder={placeholder}
          />
        </div>
      </div>
    </ScrollArea>
    <div className="flex justify-between pt-2 border-t px-4">
      <Button type="button" variant="outline" size="sm" onClick={onManualSetup}>
        Manual Setup
      </Button>
      <Button type="button" size="sm" onClick={onParse}>
        Parse & Continue
      </Button>
    </div>
  </form>
);

const McpServerIdentityFields = ({
  form,
  dispatchForm,
  editMode,
  isFieldReadOnly,
  showInMemoryOption,
}: {
  form: McpServerFormState;
  dispatchForm: Dispatch<McpServerFormAction>;
  editMode: boolean;
  isFieldReadOnly: boolean;
  showInMemoryOption: boolean;
}) => (
  <>
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground" htmlFor="server-name">
        Name
      </Label>
      <Input
        id="server-name"
        value={form.name}
        onChange={(e) => dispatchForm({ type: "SET_NAME", value: e.target.value })}
        placeholder="Server name"
        disabled={editMode || isFieldReadOnly}
        required
      />
    </div>

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground" htmlFor="server-icon">
        Icon
      </Label>
      <div className="flex items-center space-x-2">
        <EmojiPicker
          modelValue={form.icons}
          onModelValueChange={(value) => dispatchForm({ type: "SET_ICONS", value })}
        />
      </div>
    </div>

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground" htmlFor="server-type">
        Type
      </Label>
      <Select
        value={form.type}
        onValueChange={(v) => dispatchForm({ type: "SET_TYPE", value: v as MCPServerTypeOption })}
        disabled={isFieldReadOnly}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stdio">stdio</SelectItem>
          <SelectItem value="sse">SSE</SelectItem>
          <SelectItem value="http">HTTP</SelectItem>
          {showInMemoryOption && <SelectItem value="inmemory">In-Memory</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  </>
);

const McpServerTransportFields = ({
  form,
  dispatchForm,
  isFieldReadOnly,
  showBaseUrl,
  showCommandField,
  showFoldersField,
  showArgsField,
  showEnvField,
  isEnvValid,
  onAddFolder,
  onRemoveFolder,
  onAddArgsRow,
  onRemoveArgsRow,
  onArgsRowChange,
}: {
  form: McpServerFormState;
  dispatchForm: Dispatch<McpServerFormAction>;
  isFieldReadOnly: boolean;
  showBaseUrl: boolean;
  showCommandField: boolean;
  showFoldersField: boolean;
  showArgsField: boolean;
  showEnvField: boolean;
  isEnvValid: boolean;
  onAddFolder: () => void;
  onRemoveFolder: (index: number) => void;
  onAddArgsRow: () => void;
  onRemoveArgsRow: (id: string) => void;
  onArgsRowChange: (id: string, value: string) => void;
}) => (
  <>
    {showBaseUrl && (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground" htmlFor="server-base-url">
          Base URL
        </Label>
        <Input
          id="server-base-url"
          value={form.baseUrl}
          onChange={(e) => dispatchForm({ type: "SET_BASE_URL", value: e.target.value })}
          placeholder="https://..."
          disabled={isFieldReadOnly}
          required
        />
      </div>
    )}

    {showCommandField && (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground" htmlFor="server-command">
          Command
        </Label>
        <Input
          id="server-command"
          value={form.command}
          onChange={(e) => dispatchForm({ type: "SET_COMMAND", value: e.target.value })}
          placeholder="npx"
          disabled={isFieldReadOnly}
          required
        />
      </div>
    )}

    {showFoldersField && (
      <McpServerFoldersField folders={form.foldersList} onAdd={onAddFolder} onRemove={onRemoveFolder} />
    )}

    {showArgsField && (
      <McpServerArgsField
        rows={form.argsRows}
        onAdd={onAddArgsRow}
        onRemove={onRemoveArgsRow}
        onChange={onArgsRowChange}
      />
    )}

    {showEnvField && (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground" htmlFor="server-env">
          Environment Variables
        </Label>
        <Textarea
          id="server-env"
          value={form.env}
          onChange={(e) => dispatchForm({ type: "SET_ENV", value: e.target.value })}
          rows={5}
          placeholder='{"KEY": "value"}'
          className={!isEnvValid ? "border-red-500" : ""}
        />
      </div>
    )}
  </>
);

const McpServerFoldersField = ({
  folders,
  onAdd,
  onRemove,
}: {
  folders: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}) => (
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Accessible Folders</Label>
    <div className="space-y-2">
      {folders.map((folder, index) => (
        <div
          key={folder}
          className="flex items-center justify-between p-2 border border-input rounded-md bg-background"
        >
          <span className="text-sm truncate flex-1 mr-2" title={folder}>
            {folder}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
            aria-label={`Remove folder ${folder}`}
            onClick={() => onRemove(index)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full flex items-center gap-2" onClick={onAdd}>
        <Icon icon="lucide:folder-plus" className="h-4 w-4" /> Add Folder
      </Button>
      {folders.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-4">No folders selected</div>
      )}
    </div>
  </div>
);

const McpServerArgsField = ({
  rows,
  onAdd,
  onRemove,
  onChange,
}: {
  rows: Array<{
    id: string;
    value: string;
  }>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, value: string) => void;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">Arguments</Label>
      <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
        Add Argument
      </Button>
    </div>
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={row.value}
            onChange={(e) => onChange(row.id, e.target.value)}
            className="col-span-11"
            placeholder="Argument value"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="col-span-1"
            aria-label={`Remove argument ${index + 1}`}
            onClick={() => onRemove(row.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  </div>
);

const McpServerExtraFields = ({
  form,
  dispatchForm,
  isFieldReadOnly,
  showBaseUrl,
  showNpmRegistryInput,
  npmRegistry,
  onNpmRegistryChange,
  customHeadersFocused,
  onCustomHeadersFocus,
  onCustomHeadersBlur,
  customHeadersDisplayValue,
  isCustomHeadersFormatValid,
}: {
  form: McpServerFormState;
  dispatchForm: Dispatch<McpServerFormAction>;
  isFieldReadOnly: boolean;
  showBaseUrl: boolean;
  showNpmRegistryInput: boolean;
  npmRegistry: string;
  onNpmRegistryChange: (value: string) => void;
  customHeadersFocused: boolean;
  onCustomHeadersFocus: () => void;
  onCustomHeadersBlur: () => void;
  customHeadersDisplayValue: string;
  isCustomHeadersFormatValid: boolean;
}) => (
  <>
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground" htmlFor="server-description">
        Description
      </Label>
      <Input
        id="server-description"
        value={form.descriptions}
        onChange={(e) => dispatchForm({ type: "SET_DESCRIPTIONS", value: e.target.value })}
        placeholder="Server description"
        disabled={isFieldReadOnly}
      />
    </div>

    {showNpmRegistryInput && (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground" htmlFor="npm-registry">
          Custom NPM Registry
        </Label>
        <Input
          id="npm-registry"
          value={npmRegistry}
          onChange={(e) => onNpmRegistryChange(e.target.value)}
          placeholder="Leave empty for default"
        />
      </div>
    )}

    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">Auto Approve</Label>
      <div className="flex flex-col space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="auto-approve-all"
            checked={form.autoApproveAll}
            onCheckedChange={(checked) => dispatchForm({ type: "SET_AUTO_APPROVE_ALL", value: Boolean(checked) })}
          />
          <label htmlFor="auto-approve-all" className="text-sm font-medium leading-none">
            All
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="auto-approve-read"
            checked={form.autoApproveRead}
            disabled={form.autoApproveAll}
            onCheckedChange={(checked) => dispatchForm({ type: "SET_AUTO_APPROVE_READ", value: Boolean(checked) })}
          />
          <label htmlFor="auto-approve-read" className="text-sm font-medium leading-none peer-disabled:opacity-70">
            Read
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="auto-approve-write"
            checked={form.autoApproveWrite}
            disabled={form.autoApproveAll}
            onCheckedChange={(checked) => dispatchForm({ type: "SET_AUTO_APPROVE_WRITE", value: Boolean(checked) })}
          />
          <label htmlFor="auto-approve-write" className="text-sm font-medium leading-none peer-disabled:opacity-70">
            Write
          </label>
        </div>
      </div>
    </div>

    {showBaseUrl && (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground" htmlFor="server-custom-headers">
          Custom Headers
        </Label>
        <div className="relative">
          <Textarea
            id="server-custom-headers"
            value={form.customHeaders}
            onChange={(e) => dispatchForm({ type: "SET_CUSTOM_HEADERS", value: e.target.value })}
            rows={5}
            placeholder={customHeadersPlaceholder}
            className={["transition-opacity duration-200", !isCustomHeadersFormatValid ? "border-red-500" : ""].join(
              " ",
            )}
            disabled={isFieldReadOnly}
            onFocus={onCustomHeadersFocus}
            onBlur={onCustomHeadersBlur}
          />
          {!customHeadersFocused && form.customHeaders.trim() && (
            <div
              className={[
                "absolute inset-0 bg-background rounded-md border pointer-events-none",
                !isCustomHeadersFormatValid ? "border-red-500" : "",
              ].join(" ")}
            >
              <div
                className="p-3 text-sm font-mono whitespace-pre-wrap text-muted-foreground select-none overflow-hidden break-all"
                style={{
                  lineHeight: 1.4,
                  wordBreak: "break-all",
                }}
              >
                {customHeadersDisplayValue}
              </div>
            </div>
          )}
        </div>
        {!isCustomHeadersFormatValid && <p className="text-xs text-red-500">Invalid Key=Value format</p>}
        {!customHeadersFocused && form.customHeaders.trim() && (
          <p className="text-xs text-muted-foreground">Click to edit and view full content</p>
        )}
      </div>
    )}
  </>
);

export default McpServerForm;
