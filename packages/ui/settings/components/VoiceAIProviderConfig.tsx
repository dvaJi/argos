import { useEffect, useRef, useReducer } from "react";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { useProviderStore } from "#/stores/providerStore";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Separator } from "#shadcn/components/ui/separator";
import { Slider } from "#shadcn/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Icon } from "@iconify/react";
interface VoiceAIProviderConfigProps {
  provider: LLM_PROVIDER;
}
const LANGUAGE_OPTIONS = [
  {
    value: "en",
    label: "English (en)",
  },
  {
    value: "ca",
    label: "Catalan (ca)",
  },
  {
    value: "sv",
    label: "Swedish (sv)",
  },
  {
    value: "es",
    label: "Spanish (es)",
  },
  {
    value: "fr",
    label: "French (fr)",
  },
  {
    value: "de",
    label: "German (de)",
  },
  {
    value: "it",
    label: "Italian (it)",
  },
  {
    value: "pt",
    label: "Portuguese (pt)",
  },
  {
    value: "pl",
    label: "Polish (pl)",
  },
  {
    value: "ru",
    label: "Russian (ru)",
  },
  {
    value: "nl",
    label: "Dutch (nl)",
  },
];
type VoiceAIConfigUpdates = {
  audioFormat?: string;
  model?: string;
  language?: string;
  temperature?: number;
  topP?: number;
  agentId?: string;
};
type VoiceAIConfigState = {
  audioFormat: string;
  ttsModel: string;
  language: string;
  temperature: number;
  topP: number;
  agentId: string;
  isHydrating: boolean;
};
type VoiceAIConfigAction =
  | { type: "BEGIN_HYDRATION" }
  | {
      type: "HYDRATED";
      audioFormat: string;
      ttsModel: string;
      language: string;
      temperature: number;
      topP: number;
      agentId: string;
    }
  | { type: "SET_AUDIO_FORMAT"; value: string }
  | { type: "SET_TTS_MODEL"; value: string }
  | { type: "SET_LANGUAGE"; value: string }
  | { type: "SET_AGENT_ID"; value: string }
  | { type: "SET_TEMPERATURE"; value: number }
  | { type: "SET_TOP_P"; value: number };
const initialVoiceAIConfig: VoiceAIConfigState = {
  audioFormat: "mp3",
  ttsModel: "voiceai-tts-v1-latest",
  language: "en",
  temperature: 1,
  topP: 0.8,
  agentId: "",
  isHydrating: true,
};
const voiceAIConfigReducer = (state: VoiceAIConfigState, action: VoiceAIConfigAction): VoiceAIConfigState => {
  switch (action.type) {
    case "BEGIN_HYDRATION":
      return { ...state, isHydrating: true };
    case "HYDRATED":
      return {
        audioFormat: action.audioFormat,
        ttsModel: action.ttsModel,
        language: action.language,
        temperature: action.temperature,
        topP: action.topP,
        agentId: action.agentId,
        isHydrating: false,
      };
    case "SET_AUDIO_FORMAT":
      return { ...state, audioFormat: action.value };
    case "SET_TTS_MODEL":
      return { ...state, ttsModel: action.value };
    case "SET_LANGUAGE":
      return { ...state, language: action.value };
    case "SET_AGENT_ID":
      return { ...state, agentId: action.value };
    case "SET_TEMPERATURE":
      return { ...state, temperature: action.value };
    case "SET_TOP_P":
      return { ...state, topP: action.value };
  }
};
export default function VoiceAIProviderConfig({ provider }: VoiceAIProviderConfigProps) {
  const providerStore = useProviderStore();
  const [voiceConfig, dispatchVoiceConfig] = useReducer(voiceAIConfigReducer, initialVoiceAIConfig);
  const hydratingRef = useRef(true);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistUpdates = (updates: VoiceAIConfigUpdates) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(async () => {
      await providerStore.updateVoiceAIConfig(updates);
    }, 200);
  };
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);
  const loadConfig = async () => {
    hydratingRef.current = true;
    dispatchVoiceConfig({ type: "BEGIN_HYDRATION" });
    const config = await providerStore.getVoiceAIConfig();
    hydratingRef.current = false;
    dispatchVoiceConfig({
      type: "HYDRATED",
      audioFormat: config.audioFormat,
      ttsModel: config.model,
      language: config.language,
      temperature: config.temperature,
      topP: config.topP,
      agentId: config.agentId,
    });
  };
  const loadConfigRef = useRef(loadConfig);
  useEffect(() => {
    loadConfigRef.current = loadConfig;
  }, [loadConfig]);
  useEffect(() => {
    void Promise.resolve().then(() => loadConfigRef.current());
  }, []);
  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({
      audioFormat: voiceConfig.audioFormat,
    });
  }, [voiceConfig.audioFormat, persistUpdates]);
  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({
      model: voiceConfig.ttsModel,
    });
  }, [voiceConfig.ttsModel, persistUpdates]);
  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({
      language: voiceConfig.language,
    });
  }, [voiceConfig.language, persistUpdates]);
  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({
      agentId: voiceConfig.agentId,
    });
  }, [voiceConfig.agentId, persistUpdates]);
  const onTemperatureChange = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (next === undefined) return;
    dispatchVoiceConfig({ type: "SET_TEMPERATURE", value: next });
    if (hydratingRef.current) return;
    persistUpdates({
      temperature: next,
    });
  };
  const onTopPChange = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (next === undefined) return;
    dispatchVoiceConfig({ type: "SET_TOP_P", value: next });
    if (hydratingRef.current) return;
    persistUpdates({
      topP: next,
    });
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="lucide:audio-waveform" className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Text-to-Speech</p>
            <p className="text-xs text-muted-foreground">Configure voice AI settings for text-to-speech.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-audio-format`} className="text-xs font-medium">
              Audio Format
            </Label>
            <Select
              value={voiceConfig.audioFormat}
              onValueChange={(v) => dispatchVoiceConfig({ type: "SET_AUDIO_FORMAT", value: v ?? "" })}
              disabled={voiceConfig.isHydrating}
            >
              <SelectTrigger id={`${provider.id}-audio-format`}>
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="pcm">PCM</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Output audio format.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-language`} className="text-xs font-medium">
              Language
            </Label>
            <Select
              value={voiceConfig.language}
              onValueChange={(v) => dispatchVoiceConfig({ type: "SET_LANGUAGE", value: v ?? "" })}
              disabled={voiceConfig.isHydrating}
            >
              <SelectTrigger id={`${provider.id}-language`}>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Language for TTS output.</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${provider.id}-tts-model`} className="text-xs font-medium">
              Model
            </Label>
            <Input
              id={`${provider.id}-tts-model`}
              value={voiceConfig.ttsModel}
              onChange={(e) => dispatchVoiceConfig({ type: "SET_TTS_MODEL", value: e.target.value })}
              placeholder="TTS model name"
              disabled={voiceConfig.isHydrating}
            />
            <p className="text-xs text-muted-foreground">Model to use for text-to-speech.</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${provider.id}-agent-id`} className="text-xs font-medium">
              Agent ID
            </Label>
            <Input
              id={`${provider.id}-agent-id`}
              value={voiceConfig.agentId}
              onChange={(e) => dispatchVoiceConfig({ type: "SET_AGENT_ID", value: e.target.value })}
              placeholder="Agent ID"
              disabled={voiceConfig.isHydrating}
            />
            <p className="text-xs text-muted-foreground">Agent ID for voice configuration.</p>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${provider.id}-temperature`} className="text-xs font-medium">
                Temperature
              </Label>
              <span className="text-xs text-muted-foreground">{voiceConfig.temperature.toFixed(2)}</span>
            </div>
            <Slider
              id={`${provider.id}-temperature`}
              min={0}
              max={2}
              step={0.05}
              value={[voiceConfig.temperature]}
              onValueChange={onTemperatureChange}
            />
            <p className="text-xs text-muted-foreground">Controls randomness in output.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${provider.id}-top-p`} className="text-xs font-medium">
                Top P
              </Label>
              <span className="text-xs text-muted-foreground">{voiceConfig.topP.toFixed(2)}</span>
            </div>
            <Slider
              id={`${provider.id}-top-p`}
              min={0}
              max={1}
              step={0.05}
              value={[voiceConfig.topP]}
              onValueChange={onTopPChange}
            />
            <p className="text-xs text-muted-foreground">Controls diversity via nucleus sampling.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
