import { type FC, useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createSkillSyncClient } from "#api/SkillSyncClient";
import { useToast } from "#/components/use-toast";
import type { ScanResult, ImportPreview } from "@argos/shared/types/skillSync";
import { ConflictStrategy } from "@argos/shared/types/skillSync";
import ToolSelector from "./ToolSelector";
import SkillSelector from "./SkillSelector";
import ConflictResolver, { type ConflictItem } from "./ConflictResolver";
const skillSyncClient = createSkillSyncClient();
interface ImportWizardProps {
  currentStep: number;
  initialToolId?: string;
  initialSkills?: string[];
  onStepChange: (value: number) => void;
  onComplete: () => void;
  onCancel: () => void;
}
const ImportWizard: FC<ImportWizardProps> = ({
  currentStep,
  initialToolId,
  initialSkills,
  onStepChange,
  onComplete,
  onCancel,
}) => {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(initialToolId ?? null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initialSkills ?? []);
  const [importPreviews, setImportPreviews] = useState<ImportPreview[]>([]);
  const [conflictStrategies, setConflictStrategies] = useState<Record<string, ConflictStrategy>>({});
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    currentSkill: "",
  });
  const selectedTool = scanResults.find((t) => t.toolId === selectedToolId);
  const conflictNames = importPreviews.flatMap((p) => (p.conflict ? [p.skill.name] : []));
  const conflictItems = ((): ConflictItem[] => {
    return importPreviews.flatMap((p) =>
      p.conflict
        ? [
            {
              skillName: p.skill.name,
              existingName: p.conflict!.existingSkillName,
            },
          ]
        : [],
    );
  })();
  const allWarnings = (() => {
    const warnings: string[] = [];
    for (const preview of importPreviews) {
      if (preview.warnings.length > 0) {
        warnings.push(...preview.warnings.map((w) => `${preview.skill.name}: ${w}`));
      }
    }
    return warnings;
  })();
  const canProceed = (() => {
    if (currentStep === 1) return selectedToolId !== null;
    if (currentStep === 2) return selectedSkills.length > 0;
    return true;
  })();
  const nextButtonText = currentStep === 3 ? "Import" : "Next";
  const getStepClass = (step: number) => {
    if (currentStep > step) return "bg-primary text-primary-foreground";
    if (currentStep === step) return "bg-primary text-primary-foreground";
    return "bg-muted text-muted-foreground";
  };
  const handleToolSelect = (tool: ScanResult) => {
    setSelectedToolId(tool.toolId);
    setSelectedSkills(tool.skills.map((s) => s.name));
  };
  const handleBack = () => {
    if (currentStep === 1) {
      onCancel();
    } else {
      if (currentStep === 2) {
        setSelectedToolId(null);
        setSelectedSkills([]);
        setImportPreviews([]);
        setConflictStrategies({});
      }
      onStepChange(currentStep - 1);
    }
  };
  const previewImport = async () => {
    if (!selectedToolId) return;
    setLoading(true);
    try {
      const previews = await skillSyncClient.previewImport(selectedToolId, selectedSkills);
      setImportPreviews(previews);
      const strategies: Record<string, ConflictStrategy> = {};
      for (const preview of previews) {
        if (preview.conflict) {
          strategies[preview.skill.name] = ConflictStrategy.SKIP;
        }
      }
      setConflictStrategies(strategies);
    } catch (error) {
      console.error("Preview import error:", error);
      toast({
        title: "Preview Error",
        description: String(error),
        variant: "destructive",
      });
    }
    setLoading(false);
  };
  const executeImport = async () => {
    setImporting(true);
    setImportProgress({
      current: 0,
      total: importPreviews.length,
      currentSkill: "",
    });
    try {
      const result = await skillSyncClient.executeImport(importPreviews, conflictStrategies);
      if (result.success) {
        toast({
          title: "Import Successful",
          description: `Imported ${result.imported} skill(s), skipped ${result.skipped}`,
        });
        onComplete();
      } else {
        toast({
          title: "Import Partial",
          description: `Imported ${result.imported}, failed ${result.failed.length}`,
          variant: "destructive",
        });
        onComplete();
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Error",
        description: String(error),
        variant: "destructive",
      });
    }
    setImporting(false);
  };
  const handleNext = async () => {
    if (currentStep === 1) {
      onStepChange(2);
    } else if (currentStep === 2) {
      await previewImport();
      onStepChange(3);
    } else if (currentStep === 3) {
      await executeImport();
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setScanning(true);
      try {
        const results = await skillSyncClient.scanExternalTools();
        if (cancelled) return;
        setScanResults(results);
      } catch (error) {
        console.error("Scan error:", error);
        toast({
          title: "Scan Error",
          description: String(error),
          variant: "destructive",
        });
      }
      if (!cancelled) {
        setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={[
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                getStepClass(step),
              ].join(" ")}
            >
              {currentStep > step ? <Icon icon="lucide:check" className="w-4 h-4" /> : step}
            </div>
            {step < 3 && (
              <div
                className={["w-12 h-0.5 mx-2 transition-colors", currentStep > step ? "bg-primary" : "bg-muted"].join(
                  " ",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {currentStep === 1 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Select a tool to import from</h3>
            <ToolSelector
              tools={scanResults}
              selectedToolId={selectedToolId}
              loading={scanning}
              onSelect={handleToolSelect}
            />
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Select skills to import</h3>
            <SkillSelector
              skills={selectedTool?.skills || []}
              selectedSkills={selectedSkills}
              conflicts={conflictNames}
              onSelectedSkillsChange={setSelectedSkills}
            />
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Resolve conflicts</h3>
            {loading && (
              <div className="flex flex-col items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Previewing...</span>
              </div>
            )}
            {importing && (
              <div className="flex flex-col items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-8 h-8 animate-spin text-primary mb-2" />
                <span className="text-sm text-muted-foreground">
                  Importing {importProgress.current}/{importProgress.total}...
                </span>
                <span className="text-xs text-muted-foreground mt-1">{importProgress.currentSkill}</span>
              </div>
            )}
            {!loading && !importing && (
              <ConflictResolver
                conflicts={conflictItems}
                strategies={conflictStrategies}
                warnings={allWarnings}
                onStrategiesChange={setConflictStrategies}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t mt-4 flex-shrink-0">
        <Button variant="outline" onClick={handleBack} disabled={importing}>
          {currentStep === 1 ? "Cancel" : "Back"}
        </Button>
        <Button onClick={handleNext} disabled={!canProceed || importing}>
          {importing && <Icon icon="lucide:loader-2" className="w-4 h-4 mr-2 animate-spin" />}
          {nextButtonText}
        </Button>
      </div>
    </div>
  );
};
export default ImportWizard;
