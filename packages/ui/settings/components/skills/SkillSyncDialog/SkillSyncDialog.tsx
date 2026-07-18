import { type FC, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import ImportWizard from "./ImportWizard";
import ExportWizard from "./ExportWizard";

interface SkillSyncDialogProps {
  open: boolean;
  mode: "import" | "export";
  initialToolId?: string;
  initialSkills?: string[];
  onOpenChange: (value: boolean) => void;
  onCompleted: () => void;
}

export const SkillSyncDialog: FC<SkillSyncDialogProps> = ({
  open,
  mode,
  initialToolId,
  initialSkills,
  onOpenChange,
  onCompleted,
}) => {
  const [currentStep, setCurrentStep] = useState(() => (mode === "import" && initialToolId ? 2 : 1));

  const handleComplete = () => {
    onCompleted();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "import" ? "Import Skills" : "Export Skills"}</DialogTitle>
          <DialogDescription>
            {mode === "import" ? "Import skills from external tools" : "Export skills to external tools"}
          </DialogDescription>
        </DialogHeader>

        <div className="h-96 overflow-auto">
          {mode === "import" ? (
            <ImportWizard
              currentStep={currentStep}
              initialToolId={initialToolId}
              initialSkills={initialSkills}
              onStepChange={setCurrentStep}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          ) : (
            <ExportWizard
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkillSyncDialog;
