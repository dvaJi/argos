import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Switch } from "#shadcn/components/ui/switch";
import { hasNativeToolCapability, ModelType, type NewApiEndpointType } from "@argos/shared/model";
import ModelConfigDialog from "./ModelConfigDialog";
const MODEL_TYPE_PILL_LABELS: Record<ModelType, string> = {
  [ModelType.Chat]: "chat",
  [ModelType.Embedding]: "embedding",
  [ModelType.Rerank]: "rerank",
  [ModelType.ImageGeneration]: "image",
  [ModelType.VideoGeneration]: "video",
  [ModelType.TTS]: "tts",
  [ModelType.Decisions]: "decisions",
};
interface ModelConfigItemProps {
  modelName: string;
  modelId: string;
  providerId: string;
  group?: string;
  enabled: boolean;
  isCustomModel?: boolean;
  vision?: boolean;
  functionCall?: boolean;
  explicitFunctionCall?: boolean;
  reasoning?: boolean;
  enableSearch?: boolean;
  isFree?: boolean;
  type?: ModelType;
  supportedEndpointTypes?: NewApiEndpointType[];
  endpointType?: NewApiEndpointType;
  changeable?: boolean;
  hideEnableToggle?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onDeleteModel: () => void;
  onConfigChanged: () => void;
}
export default function ModelConfigItem({
  modelName,
  modelId,
  providerId,
  group,
  enabled,
  isCustomModel,
  vision,
  functionCall,
  explicitFunctionCall,
  reasoning,
  enableSearch,
  isFree,
  type = ModelType.Chat,
  supportedEndpointTypes,
  endpointType,
  changeable = true,
  hideEnableToggle = false,
  onEnabledChange,
  onDeleteModel,
  onConfigChanged,
}: ModelConfigItemProps) {
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const showWeakAgentWarning =
    type === ModelType.Chat &&
    !hasNativeToolCapability(
      {
        endpointType,
        supportedEndpointTypes,
      },
      explicitFunctionCall,
    );
  return (
    <>
      <div className="flex h-8 min-h-8 flex-row items-center gap-2 overflow-hidden bg-muted/50 px-2.5 transition-colors hover:bg-accent border-b last:border-none">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className={`truncate text-xs${!enabled ? " text-foreground/70" : ""}`}>{modelName}</span>
          {vision && <Icon icon="lucide:eye" className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-label="Vision" />}
          {functionCall && (
            <Icon
              icon="lucide:function-square"
              className="h-3.5 w-3.5 shrink-0 text-orange-500"
              aria-label="Function calling"
            />
          )}
          {showWeakAgentWarning && (
            <Icon icon="lucide:triangle-alert" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          {reasoning && (
            <Icon icon="lucide:brain" className="h-3.5 w-3.5 shrink-0 text-purple-500" aria-label="Reasoning" />
          )}
          {enableSearch && (
            <Icon icon="lucide:globe" className="h-3.5 w-3.5 shrink-0 text-green-500" aria-label="Web search" />
          )}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-1.5 whitespace-nowrap">
          {isFree && (
            <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 text-[10px] leading-4 text-green-500 select-none">
              free
            </span>
          )}
          {group && group !== "default" && (
            <span className="max-w-[6rem] truncate text-xs text-muted-foreground">{group}</span>
          )}
          <span className="shrink-0 rounded-full border border-muted-foreground/20 bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground select-none">
            {MODEL_TYPE_PILL_LABELS[type] ?? type}
          </span>
          {!hideEnableToggle && (
            <Switch
              key={`${providerId}:${modelId}`}
              data-testid={`provider-model-toggle-${providerId}-${modelId}`}
              size="sm"
              checked={enabled}
              onCheckedChange={onEnabledChange}
            />
          )}
          {changeable && (
            <Button
              variant="link"
              size="icon"
              className="w-6 h-6 text-xs text-normal rounded-md"
              onClick={() => setShowConfigDialog(true)}
              title="Configure model"
            >
              <Icon icon="lucide:settings" className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          )}
          {isCustomModel && (
            <Button
              variant="link"
              size="icon"
              className="w-6 h-6 text-xs text-normal rounded-md"
              onClick={onDeleteModel}
            >
              <Icon icon="lucide:trash-2" className="w-3.5 h-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {showConfigDialog && (
        <ModelConfigDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          modelId={modelId}
          modelName={modelName}
          providerId={providerId}
          mode="edit"
          isCustomModel={isCustomModel}
          onSaved={() => {
            onConfigChanged();
            setShowConfigDialog(false);
          }}
        />
      )}
    </>
  );
}
