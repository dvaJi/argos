import { useState, useMemo, useCallback, useEffect } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import {
  TTS_RESPONSE_FORMAT_VALUES,
  normalizeTtsSettings,
  type TtsResponseFormat,
  type TtsSettings,
} from "@argos/shared/ttsSettings";

const DEFAULT_SELECT_VALUE = "__default";

interface TtsSettingsFieldsProps {
  modelValue?: TtsSettings;
  onValueChange: (value: TtsSettings | undefined) => void;
}

export default function TtsSettingsFields({ modelValue, onValueChange }: TtsSettingsFieldsProps) {
  const tts = useMemo<TtsSettings>(() => normalizeTtsSettings(modelValue) ?? {}, [modelValue]);
  const [speedDraft, setSpeedDraft] = useState("");

  useEffect(() => {
    setSpeedDraft(typeof tts.speed === "number" ? String(tts.speed) : "");
  }, [tts.speed]);

  const emitSettings = useCallback(
    (patch: TtsSettings) => {
      const next = normalizeTtsSettings({
        ...tts,
        ...patch,
      });
      onValueChange(next);
    },
    [tts, onValueChange],
  );

  const optionSelectValue = (value: string | undefined) => value ?? DEFAULT_SELECT_VALUE;

  const onVoiceInput = useCallback(
    (value: string) => {
      emitSettings({ voice: value.trim() || undefined });
    },
    [emitSettings],
  );

  const onResponseFormatSelect = useCallback(
    (value: string) => {
      if (value === DEFAULT_SELECT_VALUE) {
        emitSettings({ responseFormat: undefined });
        return;
      }
      emitSettings({ responseFormat: value as TtsResponseFormat });
    },
    [emitSettings],
  );

  const onSpeedInput = useCallback((value: string) => {
    setSpeedDraft(value);
  }, []);

  const commitSpeed = useCallback(() => {
    const value = speedDraft.trim();
    if (!value) {
      emitSettings({ speed: undefined });
      return;
    }
    const speed = Number(value);
    if (!Number.isFinite(speed)) return;
    emitSettings({ speed });
  }, [speedDraft, emitSettings]);

  const onInstructionsInput = useCallback(
    (value: string) => {
      emitSettings({ instructions: value.trim() || undefined });
    },
    [emitSettings],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Text-to-Speech</Label>
        <p className="text-xs text-muted-foreground">Configure text-to-speech settings for this model</p>
      </div>

      <div className="space-y-2">
        <Label>Voice ID</Label>
        <Input value={tts.voice ?? ""} placeholder="Enter voice ID" onChange={(e) => onVoiceInput(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Audio Format</Label>
        <Select value={optionSelectValue(tts.responseFormat)} onValueChange={onResponseFormatSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Use model default</SelectItem>
            {TTS_RESPONSE_FORMAT_VALUES.map((format) => (
              <SelectItem key={format} value={format}>
                {format.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Speed</Label>
        <Input
          value={speedDraft}
          inputMode="decimal"
          placeholder="0.25 - 4.0"
          onChange={(e) => onSpeedInput(e.target.value)}
          onBlur={commitSpeed}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitSpeed();
            }
          }}
        />
        <p className="text-xs text-muted-foreground">Speed of the generated audio (0.25 - 4.0)</p>
      </div>

      <div className="space-y-2">
        <Label>Instructions</Label>
        <Input
          value={tts.instructions ?? ""}
          placeholder="Additional instructions"
          onChange={(e) => onInstructionsInput(e.target.value)}
        />
      </div>
    </div>
  );
}
