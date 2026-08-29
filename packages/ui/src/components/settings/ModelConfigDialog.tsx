import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "#shadcn/components/ui/dialog";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Switch } from "#shadcn/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { ModelType, ApiEndpointType } from "@argos/shared/model";
import type { ModelConfig } from "@argos/shared/presenter";
import {
  DEFAULT_MODEL_CONTEXT_LENGTH,
  DEFAULT_MODEL_MAX_TOKENS,
  DEFAULT_MODEL_TIMEOUT,
  DEFAULT_MODEL_VISION,
  DEFAULT_MODEL_FUNCTION_CALL,
  DEFAULT_MODEL_SPEECH_RECOGNITION,
  MODEL_TIMEOUT_MAX_MS,
  MODEL_TIMEOUT_MIN_MS,
} from "@argos/shared/modelConfigDefaults";
import { useModelConfigStore, setModelConfig } from "#/stores/modelConfigStore";
import { useProviderStore } from "#/stores/providerStore";
import OpenAIImageGenerationSettingsFields from "./OpenAIImageGenerationSettingsFields";
import OpenAIVideoGenerationSettingsFields from "./OpenAIVideoGenerationSettingsFields";
import TtsSettingsFields from "./TtsSettingsFields";
interface ModelConfigDialogProps {
  open: boolean;
  modelId: string;
  modelName: string;
  providerId: string;
  mode?: "create" | "edit";
  isCustomModel?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}
const createDefaultConfig = (): ModelConfig => ({
  maxTokens: DEFAULT_MODEL_MAX_TOKENS,
  contextLength: DEFAULT_MODEL_CONTEXT_LENGTH,
  timeout: DEFAULT_MODEL_TIMEOUT,
  temperature: 0.7,
  topP: undefined,
  vision: DEFAULT_MODEL_VISION,
  speechRecognition: DEFAULT_MODEL_SPEECH_RECOGNITION,
  functionCall: DEFAULT_MODEL_FUNCTION_CALL,
  reasoning: false,
  forceInterleavedThinkingCompat: undefined,
  type: ModelType.Chat,
  apiEndpoint: ApiEndpointType.Chat,
  endpointType: undefined,
  reasoningEffort: "medium",
  reasoningVisibility: undefined,
  verbosity: "medium",
  samplingParams: undefined,
});
export default function ModelConfigDialog({
  open,
  modelId,
  modelName,
  providerId,
  mode = "edit",
  isCustomModel = false,
  onOpenChange,
  onSaved,
}: ModelConfigDialogProps) {
  const modelConfigStore = useModelConfigStore();
  const providerStore = useProviderStore();
  const [config, setConfig] = useState<ModelConfig>(() => createDefaultConfig());
  const [topPDraft, setTopPDraft] = useState("");
  const [samplingParamsDraft, setSamplingParamsDraft] = useState("");
  const samplingParamsErrorRef = useRef("");
  const [modelNameField, setModelNameField] = useState(modelName ?? "");
  const [modelIdField, setModelIdField] = useState(modelId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const isCreateMode = mode === "create";
  const canEditModelIdentity = isCreateMode || isCustomModel;
  const identityDisplayName = modelNameField || modelName || "";
  const dialogTitle = isCreateMode ? "Create Model" : `Edit ${identityDisplayName}`;
  const providerIdLower = providerId?.toLowerCase() || "";
  const isOpenAICompatibleProvider = ![
    "anthropic",
    "gemini",
    "vertex",
    "aws-bedrock",
    "github-copilot",
    "ollama",
    "acp",
    "voiceai",
  ].some((key) => providerIdLower.includes(key));
  const showTtsSettings = config.type === ModelType.TTS;
  const showTemperatureControl = true;
  const showTopPControl = true;
  const loadConfig = async () => {
    if (!providerId) return;
    setModelNameField(modelName ?? "");
    setModelIdField(modelId ?? "");
    if (isCreateMode) {
      setConfig(createDefaultConfig());
      setTopPDraft("");
      setSamplingParamsDraft("");
      samplingParamsErrorRef.current = "";
      return;
    }
    if (!modelId) return;
    try {
      const modelConfig = await modelConfigStore.getModelConfig(modelId, providerId);
      setConfig({
        ...createDefaultConfig(),
        ...modelConfig,
      });
      setTopPDraft(typeof modelConfig.topP === "number" ? String(modelConfig.topP) : "");
      setSamplingParamsDraft(
        modelConfig.samplingParams !== undefined ? JSON.stringify(modelConfig.samplingParams, null, 2) : "",
      );
      samplingParamsErrorRef.current = "";
    } catch (error) {
      console.error("Failed to load model config:", error);
      setConfig(createDefaultConfig());
      setTopPDraft("");
      setSamplingParamsDraft("");
      samplingParamsErrorRef.current = "";
    }
  };
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!providerId) return;
      setModelNameField(modelName ?? "");
      setModelIdField(modelId ?? "");
      if (isCreateMode) {
        setConfig(createDefaultConfig());
        setTopPDraft("");
        setSamplingParamsDraft("");
        samplingParamsErrorRef.current = "";
        return;
      }
      if (!modelId) return;
      try {
        const modelConfig = await modelConfigStore.getModelConfig(modelId, providerId);
        if (cancelled) return;
        setConfig({
          ...createDefaultConfig(),
          ...modelConfig,
        });
        setTopPDraft(typeof modelConfig.topP === "number" ? String(modelConfig.topP) : "");
        setSamplingParamsDraft(
          modelConfig.samplingParams !== undefined ? JSON.stringify(modelConfig.samplingParams, null, 2) : "",
        );
        samplingParamsErrorRef.current = "";
      } catch (error) {
        console.error("Failed to load model config:", error);
        if (cancelled) return;
        setConfig(createDefaultConfig());
        setTopPDraft("");
        setSamplingParamsDraft("");
        samplingParamsErrorRef.current = "";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, providerId, modelName, modelId, isCreateMode, modelConfigStore]);
  const updateConfig = (patch: Partial<ModelConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...patch,
    }));
  };
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (canEditModelIdentity) {
      const trimmedName = modelNameField.trim();
      const trimmedId = modelIdField.trim();
      if (!trimmedName) newErrors.modelName = "Model name is required";
      if (!trimmedId) newErrors.modelId = "Model ID is required";
    }
    if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 1000000)) {
      newErrors.maxTokens = "Must be between 1 and 1,000,000";
    }
    if (config.contextLength && (config.contextLength < 1 || config.contextLength > 10000000)) {
      newErrors.contextLength = "Must be between 1 and 10,000,000";
    }
    if (config.timeout && (config.timeout < MODEL_TIMEOUT_MIN_MS || config.timeout > MODEL_TIMEOUT_MAX_MS)) {
      newErrors.timeout = `Must be between ${MODEL_TIMEOUT_MIN_MS}ms and ${MODEL_TIMEOUT_MAX_MS}ms`;
    }
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      newErrors.temperature = "Must be between 0 and 2";
    }
    if (samplingParamsDraft.trim()) {
      try {
        const parsed = JSON.parse(samplingParamsDraft);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          newErrors.samplingParams = "Must be a JSON object";
        }
      } catch {
        newErrors.samplingParams = "Must be valid JSON";
      }
    }
    samplingParamsErrorRef.current = newErrors.samplingParams ?? "";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const parseSamplingParams = (): Record<string, unknown> | undefined => {
    if (!samplingParamsDraft.trim()) return undefined;
    const parsed = JSON.parse(samplingParamsDraft) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Sampling parameters must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  };
  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      const finalTopP = topPDraft.trim() ? Number(topPDraft) : undefined;
      const parsedSamplingParams = parseSamplingParams();
      const payload = {
        ...config,
        topP: finalTopP !== undefined && Number.isFinite(finalTopP) ? finalTopP : undefined,
        samplingParams: parsedSamplingParams,
        imageGeneration: config.imageGeneration ?? undefined,
        videoGeneration: config.videoGeneration ?? undefined,
        tts: config.tts ?? undefined,
      };
      if (isCreateMode) {
        await modelConfigStore.setModelConfig(modelIdField.trim(), providerId, payload);
        // Note: Previously called modelConfigStore.createCustomModel which no longer exists
      } else {
        await setModelConfig(modelId, providerId, payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save model config:", error);
    }
  };
  const handleReset = () => {
    setShowResetConfirm(true);
  };
  const confirmReset = async () => {
    try {
      await modelConfigStore.resetModelConfig(modelId, providerId);
      await loadConfig();
    } catch (error) {
      console.error("Failed to reset model config:", error);
    }
    setShowResetConfirm(false);
  };
  const clampTopPDraft = () => {
    const raw = topPDraft.trim();
    if (!raw) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    if (num < 0.1) setTopPDraft("0.1");
    else if (num > 1) setTopPDraft("1");
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <p className="text-sm text-muted-foreground">Configure model parameters and capabilities</p>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-2 -mr-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
              className="space-y-6"
            >
              {canEditModelIdentity && (
                <div className="space-y-2">
                  <Label htmlFor="modelName">Model Name</Label>
                  <Input
                    id="modelName"
                    value={modelNameField}
                    type="text"
                    placeholder="Enter model name"
                    disabled={!canEditModelIdentity}
                    className={errors.modelName ? "border-destructive" : ""}
                    onChange={(e) => setModelNameField(e.target.value)}
                  />
                  {errors.modelName && <p className="text-xs text-destructive">{errors.modelName}</p>}
                </div>
              )}

              {canEditModelIdentity && (
                <div className="space-y-2">
                  <Label htmlFor="modelId">Model ID</Label>
                  <Input
                    id="modelId"
                    value={modelIdField}
                    type="text"
                    placeholder="Enter model ID"
                    disabled={!canEditModelIdentity}
                    className={errors.modelId ? "border-destructive" : ""}
                    onChange={(e) => setModelIdField(e.target.value)}
                  />
                  {errors.modelId && <p className="text-xs text-destructive">{errors.modelId}</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max Output Tokens</Label>
                <Input
                  id="maxTokens"
                  value={config.maxTokens ?? ""}
                  type="number"
                  min={1}
                  max={1000000}
                  placeholder="Max tokens"
                  className={errors.maxTokens ? "border-destructive" : ""}
                  onChange={(e) =>
                    updateConfig({
                      maxTokens: Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">Maximum number of output tokens</p>
                {errors.maxTokens && <p className="text-xs text-destructive">{errors.maxTokens}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contextLength">Context Length</Label>
                <Input
                  id="contextLength"
                  value={config.contextLength ?? ""}
                  type="number"
                  min={1}
                  max={10000000}
                  placeholder="Context length"
                  className={errors.contextLength ? "border-destructive" : ""}
                  onChange={(e) =>
                    updateConfig({
                      contextLength: Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">Maximum context window size</p>
                {errors.contextLength && <p className="text-xs text-destructive">{errors.contextLength}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (ms)</Label>
                <Input
                  id="timeout"
                  value={config.timeout ?? ""}
                  type="number"
                  step={1000}
                  min={MODEL_TIMEOUT_MIN_MS}
                  max={MODEL_TIMEOUT_MAX_MS}
                  placeholder="Timeout"
                  className={errors.timeout ? "border-destructive" : ""}
                  onChange={(e) =>
                    updateConfig({
                      timeout: Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">Request timeout in milliseconds</p>
                {errors.timeout && <p className="text-xs text-destructive">{errors.timeout}</p>}
              </div>

              {showTtsSettings && (
                <TtsSettingsFields
                  modelValue={config.tts}
                  onValueChange={(v) =>
                    updateConfig({
                      tts: v,
                    })
                  }
                />
              )}

              {showTemperatureControl && (
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    value={config.temperature ?? ""}
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    placeholder="Temperature"
                    className={errors.temperature ? "border-destructive" : ""}
                    onChange={(e) =>
                      updateConfig({
                        temperature: Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Controls randomness (0-2)</p>
                  {errors.temperature && <p className="text-xs text-destructive">{errors.temperature}</p>}
                </div>
              )}

              {showTopPControl && (
                <div className="space-y-2">
                  <Label htmlFor="topP">Top P</Label>
                  <Input
                    id="topP"
                    value={topPDraft}
                    type="text"
                    placeholder="Use model default"
                    className={errors.topP ? "border-destructive" : ""}
                    onChange={(e) => setTopPDraft(e.target.value)}
                    onBlur={clampTopPDraft}
                  />
                  <p className="text-xs text-muted-foreground">Nucleus sampling threshold (0.1-1.0)</p>
                  {errors.topP && <p className="text-xs text-destructive">{errors.topP}</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="samplingParams">Sampling Parameters (JSON)</Label>
                <Textarea
                  id="samplingParams"
                  value={samplingParamsDraft}
                  rows={5}
                  placeholder={'{\n  "temperature": 0.7,\n  "top_p": 0.9\n}'}
                  className={errors.samplingParams ? "border-destructive" : ""}
                  onChange={(e) => {
                    setSamplingParamsDraft(e.target.value);
                    samplingParamsErrorRef.current = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Arbitrary OpenAI-compatible sampling parameters sent as-is to the provider. Pi-runtime models on
                  vLLM/SGLang servers can also set a thinking-token budget, e.g.{" "}
                  <code className="rounded bg-muted/60 px-1">{`{ "thinking_token_budget": 4096 }`}</code>.
                </p>
                {errors.samplingParams && <p className="text-xs text-destructive">{errors.samplingParams}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Model Type</Label>
                <Select
                  value={config.type}
                  onValueChange={(value) =>
                    updateConfig({
                      type: value as ModelType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Model type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="embedding">Embedding</SelectItem>
                    <SelectItem value="rerank">Rerank</SelectItem>
                    <SelectItem value="imageGeneration">Image Generation</SelectItem>
                    <SelectItem value="videoGeneration">Video Generation</SelectItem>
                    <SelectItem value="tts">Text-to-Speech</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The type of model</p>
              </div>

              {isOpenAICompatibleProvider && (
                <div className="space-y-2">
                  <Label htmlFor="apiEndpoint">API Endpoint</Label>
                  <Select
                    value={config.apiEndpoint}
                    onValueChange={(value) =>
                      updateConfig({
                        apiEndpoint: value as ApiEndpointType,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="API endpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat">Chat</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio-speech">Audio Speech</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The API endpoint to use</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Vision</Label>
                  <p className="text-xs text-muted-foreground">Enable vision capabilities</p>
                </div>
                <Switch
                  checked={config.vision}
                  onCheckedChange={(value) =>
                    updateConfig({
                      vision: value,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Function Calling</Label>
                  <p className="text-xs text-muted-foreground">Enable function/tool calling</p>
                </div>
                <Switch
                  checked={config.functionCall}
                  onCheckedChange={(value) =>
                    updateConfig({
                      functionCall: value,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Reasoning</Label>
                  <p className="text-xs text-muted-foreground">Enable reasoning capabilities</p>
                </div>
                <Switch
                  checked={config.reasoning}
                  onCheckedChange={(value) =>
                    updateConfig({
                      reasoning: value,
                    })
                  }
                />
              </div>

              {config.reasoning && (
                <div className="space-y-2">
                  <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                  <Select
                    value={config.reasoningEffort}
                    onValueChange={(value) =>
                      updateConfig({
                        reasoningEffort: value as any,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Reasoning effort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Controls reasoning depth</p>
                </div>
              )}
            </form>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleReset}>
              Reset to Default
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()}>
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reset Configuration</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to reset this model configuration to its default values?
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmReset()}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
