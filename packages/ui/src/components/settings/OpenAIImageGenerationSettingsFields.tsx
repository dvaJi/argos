import { useState, useMemo, useCallback, useEffect } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import {
  IMAGE_GENERATION_MODERATION_VALUES,
  IMAGE_GENERATION_OUTPUT_FORMAT_VALUES,
  IMAGE_GENERATION_QUALITY_VALUES,
  OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES,
  OPENAI_IMAGE_GENERATION_SIZE_PRESETS,
  normalizeImageGenerationOptions,
  validateOpenAIImageGenerationSize,
  type ImageGenerationOptions,
} from "@argos/shared/imageGenerationSettings";

const DEFAULT_SELECT_VALUE = "__default";
const CUSTOM_SIZE_VALUE = "__custom";

interface OpenAIImageGenerationSettingsFieldsProps {
  modelValue?: ImageGenerationOptions;
  density?: "default" | "compact";
  onValueChange: (value: ImageGenerationOptions | undefined) => void;
}

export default function OpenAIImageGenerationSettingsFields({
  modelValue,
  density = "default",
  onValueChange,
}: OpenAIImageGenerationSettingsFieldsProps) {
  const imageGeneration = useMemo<ImageGenerationOptions>(
    () => normalizeImageGenerationOptions(modelValue) ?? {},
    [modelValue],
  );
  const [sizeSelectDraft, setSizeSelectDraft] = useState<string>(DEFAULT_SELECT_VALUE);
  const [customSizeDraft, setCustomSizeDraft] = useState("");
  const [compressionDraft, setCompressionDraft] = useState("");

  const containerClass = density === "compact" ? "space-y-3" : "space-y-4";
  const fieldClass = density === "compact" ? "space-y-1.5" : "space-y-2";
  const labelClass = density === "compact" ? "text-xs font-medium" : "";
  const triggerClass = density === "compact" ? "h-8 text-xs" : "";
  const hintClass = density === "compact" ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground";
  const errorClass = density === "compact" ? "text-[11px] text-destructive" : "text-xs text-destructive";

  const isPresetSize = (size: string | undefined): size is string =>
    typeof size === "string" && (OPENAI_IMAGE_GENERATION_SIZE_PRESETS as readonly string[]).includes(size);

  const sizeSelectValue = useMemo(() => {
    if (!imageGeneration.size) return sizeSelectDraft;
    return isPresetSize(imageGeneration.size) ? imageGeneration.size : CUSTOM_SIZE_VALUE;
  }, [imageGeneration.size, sizeSelectDraft]);

  const isCustomSizeMode = sizeSelectValue === CUSTOM_SIZE_VALUE;

  const selectedSizeValidation = useMemo(
    () => (imageGeneration.size ? validateOpenAIImageGenerationSize(imageGeneration.size) : null),
    [imageGeneration.size],
  );

  const showExperimentalHint = selectedSizeValidation?.experimental === true;

  const customSizeValidationMessage = useMemo(() => {
    const size = customSizeDraft.trim();
    if (!isCustomSizeMode || !size) return "";
    const code = validateOpenAIImageGenerationSize(size).code;
    return code ? `Invalid size: ${code}` : "";
  }, [isCustomSizeMode, customSizeDraft]);

  const showCompressionField = imageGeneration.outputFormat === "jpeg" || imageGeneration.outputFormat === "webp";

  const compressionValidationMessage = useMemo(() => {
    const value = compressionDraft.trim();
    if (!showCompressionField || !value) return "";
    const compression = Number(value);
    if (!Number.isInteger(compression) || compression < 0 || compression > 100) {
      return "Must be an integer between 0 and 100";
    }
    return "";
  }, [showCompressionField, compressionDraft]);

  useEffect(() => {
    const size = imageGeneration.size;
    if (!size) {
      setSizeSelectDraft(DEFAULT_SELECT_VALUE);
      setCustomSizeDraft("");
      return;
    }
    if (isPresetSize(size)) {
      setSizeSelectDraft(size);
      setCustomSizeDraft("");
      return;
    }
    setSizeSelectDraft(CUSTOM_SIZE_VALUE);
    setCustomSizeDraft(size);
  }, [imageGeneration.size]);

  useEffect(() => {
    setCompressionDraft(
      imageGeneration.outputCompression === undefined ? "" : String(imageGeneration.outputCompression),
    );
  }, [imageGeneration.outputCompression]);

  const emitOptions = useCallback(
    (patch: ImageGenerationOptions) => {
      const next = normalizeImageGenerationOptions({
        ...imageGeneration,
        ...patch,
      });
      onValueChange(next);
    },
    [imageGeneration, onValueChange],
  );

  const optionSelectValue = (value: string | undefined) => value ?? DEFAULT_SELECT_VALUE;
  const optionFromSelect = (value: string): string | undefined => (value === DEFAULT_SELECT_VALUE ? undefined : value);

  const onSizeSelect = (value: string) => {
    setSizeSelectDraft(value);
    if (value === DEFAULT_SELECT_VALUE) {
      setCustomSizeDraft("");
      emitOptions({ size: undefined });
      return;
    }
    if (value === CUSTOM_SIZE_VALUE) {
      setCustomSizeDraft(imageGeneration.size && !isPresetSize(imageGeneration.size) ? imageGeneration.size : "");
      return;
    }
    setCustomSizeDraft("");
    emitOptions({ size: value });
  };

  const commitCustomSize = () => {
    const size = customSizeDraft.trim();
    if (!size || validateOpenAIImageGenerationSize(size).code) return;
    emitOptions({ size });
  };

  const onQualitySelect = (value: string) => {
    emitOptions({ quality: optionFromSelect(value) as ImageGenerationOptions["quality"] });
  };

  const onOutputFormatSelect = (value: string) => {
    const outputFormat = optionFromSelect(value) as ImageGenerationOptions["outputFormat"];
    emitOptions({
      outputFormat,
      outputCompression:
        outputFormat === "jpeg" || outputFormat === "webp" ? imageGeneration.outputCompression : undefined,
    });
  };

  const commitCompression = () => {
    const value = compressionDraft.trim();
    if (!value) {
      emitOptions({ outputCompression: undefined });
      return;
    }
    if (compressionValidationMessage) return;
    emitOptions({ outputCompression: Number(value) });
  };

  const onBackgroundSelect = (value: string) => {
    emitOptions({ background: optionFromSelect(value) as ImageGenerationOptions["background"] });
  };

  const onModerationSelect = (value: string) => {
    emitOptions({ moderation: optionFromSelect(value) as ImageGenerationOptions["moderation"] });
  };

  return (
    <div className={containerClass}>
      <div className={fieldClass}>
        <Label className={labelClass}>Image Size</Label>
        <Select value={sizeSelectValue} onValueChange={onSizeSelect}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Default</SelectItem>
            {OPENAI_IMAGE_GENERATION_SIZE_PRESETS.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_SIZE_VALUE}>Custom</SelectItem>
          </SelectContent>
        </Select>
        {isCustomSizeMode && (
          <Input
            value={customSizeDraft}
            className={customSizeValidationMessage ? "border-destructive" : ""}
            placeholder="e.g. 1024x1024"
            onChange={(e) => setCustomSizeDraft(e.target.value)}
            onBlur={commitCustomSize}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustomSize();
              }
            }}
          />
        )}
        {customSizeValidationMessage && <p className={errorClass}>{customSizeValidationMessage}</p>}
        {showExperimentalHint && <p className={hintClass}>This size is experimental</p>}
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Quality</Label>
        <Select value={optionSelectValue(imageGeneration.quality)} onValueChange={onQualitySelect}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Default</SelectItem>
            {IMAGE_GENERATION_QUALITY_VALUES.map((quality) => (
              <SelectItem key={quality} value={quality}>
                {quality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Output Format</Label>
        <Select value={optionSelectValue(imageGeneration.outputFormat)} onValueChange={onOutputFormatSelect}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Default</SelectItem>
            {IMAGE_GENERATION_OUTPUT_FORMAT_VALUES.map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showCompressionField && (
        <div className={fieldClass}>
          <Label className={labelClass}>Compression</Label>
          <Input
            value={compressionDraft}
            inputMode="numeric"
            className={compressionValidationMessage ? "border-destructive" : ""}
            placeholder="0-100"
            onChange={(e) => setCompressionDraft(e.target.value)}
            onBlur={commitCompression}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCompression();
              }
            }}
          />
          {compressionValidationMessage && <p className={errorClass}>{compressionValidationMessage}</p>}
        </div>
      )}

      <div className={fieldClass}>
        <Label className={labelClass}>Background</Label>
        <Select value={optionSelectValue(imageGeneration.background)} onValueChange={onBackgroundSelect}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Default</SelectItem>
            {OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES.map((background) => (
              <SelectItem key={background} value={background}>
                {background}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={fieldClass}>
        <Label className={labelClass}>Moderation</Label>
        <Select value={optionSelectValue(imageGeneration.moderation)} onValueChange={onModerationSelect}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SELECT_VALUE}>Default</SelectItem>
            {IMAGE_GENERATION_MODERATION_VALUES.map((moderation) => (
              <SelectItem key={moderation} value={moderation}>
                {moderation}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
