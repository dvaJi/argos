import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Switch } from "#shadcn/components/ui/switch";
import { hasNativeToolCapability, ModelType, type NewApiEndpointType } from "@argos/shared/model";
import ModelConfigDialog from "./ModelConfigDialog";

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

  const showWeakAgentWarning = useMemo(
    () =>
      type === ModelType.Chat &&
      !hasNativeToolCapability(
        {
          endpointType,
          supportedEndpointTypes,
        },
        explicitFunctionCall,
      ),
    [type, endpointType, supportedEndpointTypes, explicitFunctionCall],
  );

  return (
    <>
      <div className="flex h-12 min-h-12 flex-row items-center gap-2 overflow-hidden bg-muted/50 px-2.5 py-1.5 transition-colors hover:bg-accent border-b last:border-none">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className={`truncate text-xs${!enabled ? " text-foreground/70" : ""}`}>{modelName}</span>
          {vision && <Icon icon="lucide:eye" className="h-4 w-4 shrink-0 text-blue-500" aria-label="Vision" />}
          {functionCall && (
            <Icon
              icon="lucide:function-square"
              className="h-4 w-4 shrink-0 text-orange-500"
              aria-label="Function calling"
            />
          )}
          {showWeakAgentWarning && <Icon icon="lucide:triangle-alert" className="h-4 w-4 shrink-0 text-amber-500" />}
          {reasoning && (
            <Icon icon="lucide:brain" className="h-4 w-4 shrink-0 text-purple-500" aria-label="Reasoning" />
          )}
          {enableSearch && (
            <Icon icon="lucide:globe" className="h-4 w-4 shrink-0 text-green-500" aria-label="Web search" />
          )}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2 whitespace-nowrap">
          {group && group !== "default" && (
            <span className="max-w-[6rem] truncate text-xs text-muted-foreground">{group}</span>
          )}
          <span className="shrink-0 rounded-full border border-muted-foreground/20 bg-muted px-2 py-0.5 text-xs text-muted-foreground select-none">
            {type}
          </span>
          {!hideEnableToggle && (
            <Switch
              key={`${providerId}:${modelId}`}
              data-testid={`provider-model-toggle-${providerId}-${modelId}`}
              checked={enabled}
              onCheckedChange={onEnabledChange}
            />
          )}
          {changeable && (
            <Button
              variant="link"
              size="icon"
              className="w-7 h-7 text-xs text-normal rounded-lg"
              onClick={() => setShowConfigDialog(true)}
              title="Configure model"
            >
              <Icon icon="lucide:settings" className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
          {isCustomModel && (
            <Button
              variant="link"
              size="icon"
              className="w-7 h-7 text-xs text-normal rounded-lg"
              onClick={onDeleteModel}
            >
              <Icon icon="lucide:trash-2" className="w-4 h-4 text-destructive" />
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
