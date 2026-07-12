import { useState } from "react";
import { Button } from "#shadcn/components/ui/button";
import { Icon } from "@iconify/react";
import ModelConfigDialog from "#/components/settings/ModelConfigDialog";

interface AddCustomModelButtonProps {
  modelId?: string;
  modelName?: string;
  providerId?: string;
  mode?: "create" | "edit";
  isCustomModel?: boolean;
  children?: React.ReactNode;
  onSaved?: () => void;
}

export default function AddCustomModelButton({
  modelId = "",
  modelName = "",
  providerId = "",
  mode = "create",
  isCustomModel = true,
  children,
  onSaved,
}: AddCustomModelButtonProps) {
  const [showAddModelDialog, setShowAddModelDialog] = useState(false);

  const handleSaved = () => {
    setShowAddModelDialog(false);
    onSaved?.();
  };

  return (
    <div className="inline-flex items-center">
      <Button variant="outline" className="text-xs text-normal rounded-lg" onClick={() => setShowAddModelDialog(true)}>
        {children ?? (
          <>
            <Icon icon="lucide:plus" className="w-4 h-4 text-muted-foreground" />
            Add Model
          </>
        )}
      </Button>
      <ModelConfigDialog
        open={showAddModelDialog}
        onOpenChange={setShowAddModelDialog}
        modelId={modelId}
        modelName={modelName}
        providerId={providerId}
        mode={mode}
        isCustomModel={isCustomModel}
        onSaved={handleSaved}
      />
    </div>
  );
}
