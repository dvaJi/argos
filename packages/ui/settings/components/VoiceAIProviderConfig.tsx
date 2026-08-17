import { useState, useEffect, useRef, useCallback } from "react";
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
  { value: "en", label: "English (en)" },
  { value: "ca", label: "Catalan (ca)" },
  { value: "sv", label: "Swedish (sv)" },
  { value: "es", label: "Spanish (es)" },
  { value: "fr", label: "French (fr)" },
  { value: "de", label: "German (de)" },
  { value: "it", label: "Italian (it)" },
  { value: "pt", label: "Portuguese (pt)" },
  { value: "pl", label: "Polish (pl)" },
  { value: "ru", label: "Russian (ru)" },
  { value: "nl", label: "Dutch (nl)" },
];

type VoiceAIConfigUpdates = {
  audioFormat?: string;
  model?: string;
  language?: string;
  temperature?: number;
  topP?: number;
  agentId?: string;
};

export default function VoiceAIProviderConfig({ provider }: VoiceAIProviderConfigProps) {
  const providerStore = useProviderStore();

  const [audioFormat, setAudioFormat] = useState("mp3");
  const [ttsModel, setTtsModel] = useState("voiceai-tts-v1-latest");
  const [language, setLanguage] = useState("en");
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(0.8);
  const [agentId, setAgentId] = useState("");
  const [isHydrating, setIsHydrating] = useState(true);
  const hydratingRef = useRef(true);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistUpdates = useCallback(
    (updates: VoiceAIConfigUpdates) => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(async () => {
        await providerStore.updateVoiceAIConfig(updates);
      }, 200);
    },
    [providerStore],
  );

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const loadConfig = async () => {
    hydratingRef.current = true;
    setIsHydrating(true);
    const config = await providerStore.getVoiceAIConfig();
    setAudioFormat(config.audioFormat);
    setTtsModel(config.model);
    setLanguage(config.language);
    setTemperature(config.temperature);
    setTopP(config.topP);
    setAgentId(config.agentId);
    hydratingRef.current = false;
    setIsHydrating(false);
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({ audioFormat });
  }, [audioFormat]);

  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({ model: ttsModel });
  }, [ttsModel]);

  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({ language });
  }, [language]);

  useEffect(() => {
    if (hydratingRef.current) return;
    persistUpdates({ agentId });
  }, [agentId]);

  const onTemperatureChange = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (next === undefined) return;
    setTemperature(next);
    if (hydratingRef.current) return;
    persistUpdates({ temperature: next });
  };

  const onTopPChange = (value: number | readonly number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (next === undefined) return;
    setTopP(next);
    if (hydratingRef.current) return;
    persistUpdates({ topP: next });
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
            <Select value={audioFormat} onValueChange={(v) => setAudioFormat(v ?? "")} disabled={isHydrating}>
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
            <Select value={language} onValueChange={(v) => setLanguage(v ?? "")} disabled={isHydrating}>
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
              value={ttsModel}
              onChange={(e) => setTtsModel(e.target.value)}
              placeholder="TTS model name"
              disabled={isHydrating}
            />
            <p className="text-xs text-muted-foreground">Model to use for text-to-speech.</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${provider.id}-agent-id`} className="text-xs font-medium">
              Agent ID
            </Label>
            <Input
              id={`${provider.id}-agent-id`}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Agent ID"
              disabled={isHydrating}
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
              <span className="text-xs text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              id={`${provider.id}-temperature`}
              min={0}
              max={2}
              step={0.05}
              value={[temperature]}
              onValueChange={onTemperatureChange}
            />
            <p className="text-xs text-muted-foreground">Controls randomness in output.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${provider.id}-top-p`} className="text-xs font-medium">
                Top P
              </Label>
              <span className="text-xs text-muted-foreground">{topP.toFixed(2)}</span>
            </div>
            <Slider
              id={`${provider.id}-top-p`}
              min={0}
              max={1}
              step={0.05}
              value={[topP]}
              onValueChange={onTopPChange}
            />
            <p className="text-xs text-muted-foreground">Controls diversity via nucleus sampling.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
