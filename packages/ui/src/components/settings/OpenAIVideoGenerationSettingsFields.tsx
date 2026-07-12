import { useMemo, useCallback } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Switch } from "#shadcn/components/ui/switch";
import { normalizeVideoGenerationOptions, type VideoGenerationOptions } from "@argos/shared/videoGenerationSettings";

interface OpenAIVideoGenerationSettingsFieldsProps {
  modelValue?: VideoGenerationOptions;
  density?: "default" | "compact";
  onValueChange: (value: VideoGenerationOptions | undefined) => void;
}

export default function OpenAIVideoGenerationSettingsFields({
  modelValue,
  density = "default",
  onValueChange,
}: OpenAIVideoGenerationSettingsFieldsProps) {
  const videoGeneration = useMemo<VideoGenerationOptions>(
    () => normalizeVideoGenerationOptions(modelValue) ?? {},
    [modelValue],
  );

  const containerClass = density === "compact" ? "space-y-3" : "space-y-4";
  const fieldClass = density === "compact" ? "space-y-1.5" : "space-y-2";
  const labelClass = density === "compact" ? "text-xs font-medium" : "";
  const hintClass = density === "compact" ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground";
  const inputClass = density === "compact" ? "h-8 text-xs" : "";
  const durationDraft = typeof videoGeneration.duration === "number" ? String(videoGeneration.duration) : "";

  const emitOptions = useCallback(
    (patch: VideoGenerationOptions) => {
      const next = normalizeVideoGenerationOptions({
        ...videoGeneration,
        ...patch,
      });
      onValueChange(next);
    },
    [videoGeneration, onValueChange],
  );

  const normalizeTextInput = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed || undefined;
  };

  const onTextFieldUpdate = (field: "size" | "seconds" | "ratio" | "resolution", value: string) => {
    emitOptions({ [field]: normalizeTextInput(value) });
  };

  const onDurationInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      emitOptions({ duration: undefined });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    emitOptions({ duration: Number.isFinite(parsed) ? parsed : undefined });
  };

  const onBooleanFieldUpdate = (field: "watermark" | "generateAudio", value: boolean) => {
    emitOptions({ [field]: value });
  };

  return (
    <div className={containerClass}>
      <div className={fieldClass}>
        <Label className={labelClass}>Size</Label>
        <Input
          value={videoGeneration.size ?? ""}
          className={inputClass}
          placeholder="e.g. 1920x1080"
          onChange={(e) => onTextFieldUpdate("size", e.target.value)}
        />
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Seconds</Label>
        <Input
          value={videoGeneration.seconds ?? ""}
          className={inputClass}
          placeholder="Duration in seconds"
          onChange={(e) => onTextFieldUpdate("seconds", e.target.value)}
        />
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Duration</Label>
        <Input
          value={durationDraft}
          className={inputClass}
          inputMode="numeric"
          placeholder="Duration in seconds"
          onChange={(e) => onDurationInput(e.target.value)}
        />
        <p className={hintClass}>Maximum duration of the generated video in seconds</p>
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Aspect Ratio</Label>
        <Input
          value={videoGeneration.ratio ?? ""}
          className={inputClass}
          placeholder="e.g. 16:9"
          onChange={(e) => onTextFieldUpdate("ratio", e.target.value)}
        />
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Resolution</Label>
        <Input
          value={videoGeneration.resolution ?? ""}
          className={inputClass}
          placeholder="e.g. 1080p"
          onChange={(e) => onTextFieldUpdate("resolution", e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label className={labelClass}>Watermark</Label>
          <p className={hintClass}>Include watermark in generated video</p>
        </div>
        <Switch
          checked={Boolean(videoGeneration.watermark)}
          onCheckedChange={(v) => onBooleanFieldUpdate("watermark", v)}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label className={labelClass}>Generate Audio</Label>
          <p className={hintClass}>Generate audio for the video</p>
        </div>
        <Switch
          checked={Boolean(videoGeneration.generateAudio)}
          onCheckedChange={(v) => onBooleanFieldUpdate("generateAudio", v)}
        />
      </div>
    </div>
  );
}
