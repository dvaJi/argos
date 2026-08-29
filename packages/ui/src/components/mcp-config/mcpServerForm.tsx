import { type FC, type FormEvent, useState } from "react";
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
const McpServerForm: FC<McpServerFormProps> = ({
  serverName: serverNameProp,
  initialConfig,
  editMode = false,
  defaultJsonConfig,
  onSubmit,
}) => {
  const { toast } = useToast();
  const deviceClient = createDeviceClient();
  const initialArgs = Array.isArray(initialConfig?.args) ? initialConfig.args : [];
  const [name, setName] = useState(serverNameProp || "");
  const [command, setCommand] = useState(initialConfig?.command || "npx");
  const [env, setEnv] = useState(() => JSON.stringify(initialConfig?.env || {}, null, 2));
  const [descriptions, setDescriptions] = useState(initialConfig?.descriptions || "");
  const [icons, setIcons] = useState(initialConfig?.icons || "📁");
  const [type, setType] = useState<MCPServerTypeOption>(
    (initialConfig?.type as MCPServerTypeOption | undefined) || "stdio",
  );
  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseUrl || "");
  const [customHeaders, setCustomHeaders] = useState(() =>
    initialConfig?.customHeaders ? formatJsonHeaders(initialConfig.customHeaders) : "",
  );
  const [customHeadersFocused, setCustomHeadersFocused] = useState(false);
  const [npmRegistry, setNpmRegistry] = useState(initialConfig?.customNpmRegistry || "");
  const [autoApproveAll, setAutoApproveAll] = useState(() => initialConfig?.autoApprove?.includes("all") || false);
  const [autoApproveRead, setAutoApproveRead] = useState(
    () => initialConfig?.autoApprove?.includes("read") || initialConfig?.autoApprove?.includes("all") || false,
  );
  const [autoApproveWrite, setAutoApproveWrite] = useState(
    () => initialConfig?.autoApprove?.includes("write") || initialConfig?.autoApprove?.includes("all") || false,
  );
  const [currentStep, setCurrentStep] = useState(editMode ? "detailed" : "simple");
  const [jsonConfig, setJsonConfig] = useState("");
  const [argsRows, setArgsRows] = useState<
    Array<{
      id: string;
      value: string;
    }>
  >(() => createArgsRows(initialArgs));
  const [foldersList, setFoldersList] = useState<string[]>(() => [...initialArgs]);
  // Mirror the incoming `defaultJsonConfig` prop into the editable jsonConfig
  // state (prev-compare during render — no effect needed).
  const [syncedDefaultJsonConfig, setSyncedDefaultJsonConfig] = useState(defaultJsonConfig);
  if (syncedDefaultJsonConfig !== defaultJsonConfig) {
    setSyncedDefaultJsonConfig(defaultJsonConfig);
    if (defaultJsonConfig) {
      setJsonConfig(defaultJsonConfig);
    }
  }
  const isInMemoryType = type === "inmemory";
  const isBuildInFileSystem = isInMemoryType && name === "buildInFileSystem";
  const isHttpTransportType = type === "http";
  const isRemoteType = type === "sse" || isHttpTransportType;
  const isFieldReadOnly = editMode && isInMemoryType;
  const showBaseUrl = isRemoteType;
  const showCommandFields = type === "stdio";
  const showArgsInput = showCommandFields || (isInMemoryType && !isBuildInFileSystem);
  const showFolderSelector = isBuildInFileSystem;
  const showNpmRegistryInput = type === "stdio" && ["npx", "node"].includes(command.toLowerCase());
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
  const addArgsRow = () =>
    setArgsRows((prev) => [
      ...prev,
      {
        id: nanoid(),
        value: "",
      },
    ]);
  const removeArgsRow = (id: string) => setArgsRows((prev) => prev.filter((row) => row.id !== id));
  const addFolder = async () => {
    try {
      const result = await deviceClient.selectDirectory();
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        if (!foldersList.includes(selectedPath)) {
          setFoldersList((prev) => [...prev, selectedPath]);
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
  const removeFolder = (index: number) => setFoldersList((prev) => prev.filter((_, i) => i !== index));
  const isNameValid = name.trim().length > 0;
  const isCommandValid = (() => {
    if (isRemoteType) return true;
    if (type === "stdio" || isInMemoryType) return command.trim().length > 0;
    return true;
  })();
  const isEnvValid = (() => {
    try {
      if (!env.trim()) return true;
      JSON.parse(env);
      return true;
    } catch {
      return false;
    }
  })();
  const isBaseUrlValid = !isRemoteType || baseUrl.trim().length > 0;
  const isCustomHeadersFormatValid = validateKeyValueHeaders(customHeaders);
  const isFormValid = (() => {
    if (!isNameValid) return false;
    if (isRemoteType) return isNameValid && isBaseUrlValid && isCustomHeadersFormatValid;
    return isNameValid && isCommandValid && isEnvValid;
  })();
  const customHeadersDisplayValue = (() => {
    if (customHeadersFocused || !customHeaders.trim()) {
      return customHeaders;
    }
    return customHeaders
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
      setName(serverName);
      setCommand(serverConfig.command || "npx");
      setEnv(JSON.stringify(serverConfig.env || {}, null, 2));
      setDescriptions(serverConfig.descriptions || "");
      setIcons(serverConfig.icons || "📁");
      const incomingArgs = Array.isArray(serverConfig.args) ? serverConfig.args : [];
      setArgsRows(createArgsRows(incomingArgs));
      setFoldersList(incomingArgs);
      const incomingType = serverConfig.type as MCPServerTypeOption | undefined;
      const url = serverConfig.url || serverConfig.baseUrl || "";
      setBaseUrl(url);
      const fallbackType: MCPServerTypeOption = url ? "http" : "stdio";
      setType(incomingType && VALID_MCP_TYPES.includes(incomingType) ? incomingType : fallbackType);
      const headersFromConfig = serverConfig.customHeaders || serverConfig.headers;
      setCustomHeaders(headersFromConfig ? formatJsonHeaders(headersFromConfig) : "");
      setAutoApproveAll(serverConfig.autoApprove?.includes("all") || false);
      setAutoApproveRead(
        serverConfig.autoApprove?.includes("read") || serverConfig.autoApprove?.includes("all") || false,
      );
      setAutoApproveWrite(
        serverConfig.autoApprove?.includes("write") || serverConfig.autoApprove?.includes("all") || false,
      );
      setCurrentStep("detailed");
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
    if (autoApproveAll) {
      autoApprove.push("all");
    } else {
      if (autoApproveRead) autoApprove.push("read");
      if (autoApproveWrite) autoApprove.push("write");
    }
    const baseConfig = {
      descriptions: descriptions.trim(),
      icons: icons.trim(),
      autoApprove,
      type,
      enabled: initialConfig?.enabled ?? false,
    };
    let parsedEnv = {};
    try {
      if ((type === "stdio" || isInMemoryType) && env.trim()) parsedEnv = JSON.parse(env);
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
      if (isRemoteType && customHeaders.trim()) parsedCustomHeaders = parseKeyValueHeaders(customHeaders);
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
        baseUrl: baseUrl.trim(),
        customHeaders: parsedCustomHeaders,
      };
    } else {
      const normalizedArgs = isBuildInFileSystem
        ? foldersList.filter((folder) => folder.trim().length > 0)
        : argsRows.flatMap((row) => {
            const value = row.value.trim();
            return value.length > 0 ? [value] : [];
          });
      serverConfig = {
        ...baseConfig,
        command: command.trim(),
        args: normalizedArgs,
        env: parsedEnv,
        baseUrl: baseUrl.trim(),
      };
    }
    if (serverConfig.customHeaders) {
      setCustomHeaders(formatJsonHeaders(serverConfig.customHeaders));
    }
    if (showNpmRegistryInput && npmRegistry.trim()) {
      serverConfig.customNpmRegistry = npmRegistry.trim();
    } else {
      serverConfig.customNpmRegistry = "";
    }
    onSubmit(name.trim(), serverConfig);
  };
  if (currentStep === "simple") {
    return (
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
                onChange={(e) => setJsonConfig(e.target.value)}
                rows={10}
                placeholder={placeholder}
              />
            </div>
          </div>
        </ScrollArea>
        <div className="flex justify-between pt-2 border-t px-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setCurrentStep("detailed")}>
            Manual Setup
          </Button>
          <Button type="button" size="sm" onClick={parseJsonConfig}>
            Parse & Continue
          </Button>
        </div>
      </form>
    );
  }
  return (
    <form className="space-y-2 h-full flex flex-col" onSubmit={handleSubmit}>
      <ScrollArea className="h-0 grow">
        <div className="space-y-2 px-4 pb-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="server-name">
              Name
            </Label>
            <Input
              id="server-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              <EmojiPicker modelValue={icons} onModelValueChange={setIcons} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="server-type">
              Type
            </Label>
            <Select value={type} onValueChange={(v) => setType(v as MCPServerTypeOption)} disabled={isFieldReadOnly}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
                <SelectItem value="http">HTTP</SelectItem>
                {editMode && initialConfig?.type === "inmemory" && <SelectItem value="inmemory">In-Memory</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {showBaseUrl && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" htmlFor="server-base-url">
                Base URL
              </Label>
              <Input
                id="server-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://..."
                disabled={isFieldReadOnly}
                required
              />
            </div>
          )}

          {showCommandFields && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" htmlFor="server-command">
                Command
              </Label>
              <Input
                id="server-command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
                disabled={isFieldReadOnly}
                required
              />
            </div>
          )}

          {showFolderSelector && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Accessible Folders</Label>
              <div className="space-y-2">
                {foldersList.map((folder, index) => (
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
                      onClick={() => removeFolder(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center gap-2"
                  onClick={addFolder}
                >
                  <Icon icon="lucide:folder-plus" className="h-4 w-4" /> Add Folder
                </Button>
                {foldersList.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">No folders selected</div>
                )}
              </div>
            </div>
          )}

          {!showFolderSelector && showArgsInput && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Arguments</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addArgsRow}>
                  Add Argument
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {argsRows.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      value={row.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        setArgsRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  value: val,
                                }
                              : r,
                          ),
                        );
                      }}
                      className="col-span-11"
                      placeholder="Argument value"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="col-span-1"
                      aria-label={`Remove argument ${index + 1}`}
                      onClick={() => removeArgsRow(row.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(showCommandFields || isInMemoryType) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" htmlFor="server-env">
                Environment Variables
              </Label>
              <Textarea
                id="server-env"
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                rows={5}
                placeholder='{"KEY": "value"}'
                className={!isEnvValid ? "border-red-500" : ""}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="server-description">
              Description
            </Label>
            <Input
              id="server-description"
              value={descriptions}
              onChange={(e) => setDescriptions(e.target.value)}
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
                onChange={(e) => setNpmRegistry(e.target.value)}
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
                  checked={autoApproveAll}
                  onCheckedChange={(checked) => {
                    const val = Boolean(checked);
                    setAutoApproveAll(val);
                    if (val) {
                      setAutoApproveRead(true);
                      setAutoApproveWrite(true);
                    }
                  }}
                />
                <label htmlFor="auto-approve-all" className="text-sm font-medium leading-none">
                  All
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-approve-read"
                  checked={autoApproveRead}
                  disabled={autoApproveAll}
                  onCheckedChange={(checked) => setAutoApproveRead(Boolean(checked))}
                />
                <label
                  htmlFor="auto-approve-read"
                  className="text-sm font-medium leading-none peer-disabled:opacity-70"
                >
                  Read
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-approve-write"
                  checked={autoApproveWrite}
                  disabled={autoApproveAll}
                  onCheckedChange={(checked) => setAutoApproveWrite(Boolean(checked))}
                />
                <label
                  htmlFor="auto-approve-write"
                  className="text-sm font-medium leading-none peer-disabled:opacity-70"
                >
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
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  rows={5}
                  placeholder={customHeadersPlaceholder}
                  className={[
                    "transition-opacity duration-200",
                    !isCustomHeadersFormatValid ? "border-red-500" : "",
                  ].join(" ")}
                  disabled={isFieldReadOnly}
                  onFocus={() => setCustomHeadersFocused(true)}
                  onBlur={() => setCustomHeadersFocused(false)}
                />
                {!customHeadersFocused && customHeaders.trim() && (
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
              {!customHeadersFocused && customHeaders.trim() && (
                <p className="text-xs text-muted-foreground">Click to edit and view full content</p>
              )}
            </div>
          )}
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
export default McpServerForm;
