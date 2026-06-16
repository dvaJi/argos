import { type FC, useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Checkbox } from "@shadcn/components/ui/checkbox";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { Label } from "@shadcn/components/ui/label";
import { Input } from "@shadcn/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@shadcn/components/ui/radio-group";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { useToast } from "@/components/use-toast";
import { useSkillsStore, loadSkills } from "@/stores/skillsStore";
import type { ExternalToolConfig, ExportPreview, KiroInclusionMode } from "@shared/types/skillSync";
import { ConflictStrategy } from "@shared/types/skillSync";
import ConflictResolver, { type ConflictItem } from "./ConflictResolver";

interface ExportWizardProps {
  currentStep: number;
  onStepChange: (value: number) => void;
  onComplete: () => void;
  onCancel: () => void;
}

export const ExportWizard: FC<ExportWizardProps> = ({ currentStep, onStepChange, onComplete, onCancel }) => {
  const { toast } = useToast();
  const skillSyncPresenter = useLegacyPresenter("skillSyncPresenter");
  const skillsStore = useSkillsStore();
  const localSkills = skillsStore.skills;
  const loadingSkills = skillsStore.loading;

  const [scanningTools, setScanningTools] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillCheckedState, setSkillCheckedState] = useState<Record<string, boolean>>({});
  const [availableTools, setAvailableTools] = useState<ExternalToolConfig[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [exportPreviews, setExportPreviews] = useState<ExportPreview[]>([]);
  const [conflictStrategies, setConflictStrategies] = useState<Record<string, ConflictStrategy>>({});
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, currentSkill: "" });
  const [kiroInclusion, setKiroInclusion] = useState<KiroInclusionMode>("on-demand");
  const [kiroFilePatterns, setKiroFilePatterns] = useState("");

  const allSkillsSelected = useMemo(
    () => localSkills.length > 0 && selectedSkills.length === localSkills.length,
    [localSkills, selectedSkills],
  );

  const isKiroSelected = useMemo(() => selectedToolId === "kiro", [selectedToolId]);

  const conflictItems = useMemo((): ConflictItem[] => {
    return exportPreviews
      .filter((p) => p.conflict)
      .map((p) => ({ skillName: p.skillName, existingName: p.conflict!.existingPath }));
  }, [exportPreviews]);

  const allWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const preview of exportPreviews) {
      if (preview.warnings.length > 0) {
        warnings.push(...preview.warnings.map((w) => `${preview.skillName}: ${w}`));
      }
    }
    return warnings;
  }, [exportPreviews]);

  const canProceed = useMemo(() => {
    if (currentStep === 1) return selectedSkills.length > 0;
    if (currentStep === 2) return selectedToolId !== null;
    return true;
  }, [currentStep, selectedSkills, selectedToolId]);

  const nextButtonText = currentStep === 3 ? "Export" : "Next";

  const exportOptions = useMemo(() => {
    if (selectedToolId === "kiro") {
      const options: Record<string, unknown> = { inclusion: kiroInclusion };
      if (kiroInclusion === "conditional" && kiroFilePatterns.trim()) {
        options.filePatterns = kiroFilePatterns
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }
      return options;
    }
    return undefined;
  }, [selectedToolId, kiroInclusion, kiroFilePatterns]);

  const getStepClass = (step: number) => {
    if (currentStep > step) return "bg-primary text-primary-foreground";
    if (currentStep === step) return "bg-primary text-primary-foreground";
    return "bg-muted text-muted-foreground";
  };

  const getToolIcon = (toolId: string): string => {
    const icons: Record<string, string> = {
      "claude-code": "simple-icons:anthropic",
      cursor: "simple-icons:cursor",
      windsurf: "lucide:wind",
      copilot: "simple-icons:github",
      kiro: "lucide:sparkles",
      antigravity: "lucide:rocket",
    };
    return icons[toolId] || "lucide:box";
  };

  const getToolIconBg = (toolId: string): string => {
    const bgs: Record<string, string> = {
      "claude-code": "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      cursor: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      windsurf: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
      copilot: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
      kiro: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
      antigravity: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    };
    return bgs[toolId] || "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400";
  };

  const updateSkillChecked = (skillName: string, checked: boolean) => {
    setSkillCheckedState((prev) => ({ ...prev, [skillName]: checked }));
    if (checked) {
      if (!selectedSkills.includes(skillName)) {
        setSelectedSkills((prev) => [...prev, skillName]);
      }
    } else {
      setSelectedSkills((prev) => prev.filter((n) => n !== skillName));
    }
  };

  const toggleAllSkills = () => {
    if (allSkillsSelected) {
      setSelectedSkills([]);
      const newState: Record<string, boolean> = {};
      for (const skill of localSkills) newState[skill.name] = false;
      setSkillCheckedState(newState);
    } else {
      setSelectedSkills(localSkills.map((s) => s.name));
      const newState: Record<string, boolean> = {};
      for (const skill of localSkills) newState[skill.name] = true;
      setSkillCheckedState(newState);
    }
  };

  const handleBack = () => {
    if (currentStep === 1) onCancel();
    else onStepChange(currentStep - 1);
  };

  const loadTools = async () => {
    setScanningTools(true);
    try {
      setAvailableTools(await skillSyncPresenter.getRegisteredTools());
    } catch (error) {
      console.error("Load tools error:", error);
      toast({ title: "Load Tools Error", description: String(error), variant: "destructive" });
    } finally {
      setScanningTools(false);
    }
  };

  const previewExport = async () => {
    if (!selectedToolId) return;
    setLoading(true);
    try {
      const previews = await skillSyncPresenter.previewExport(selectedSkills, selectedToolId, exportOptions);
      setExportPreviews(previews);
      const strategies: Record<string, ConflictStrategy> = {};
      for (const preview of previews) {
        if (preview.conflict) strategies[preview.skillName] = ConflictStrategy.SKIP;
      }
      setConflictStrategies(strategies);
    } catch (error) {
      console.error("Preview export error:", error);
      toast({ title: "Preview Error", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const executeExport = async () => {
    setExporting(true);
    setExportProgress({ current: 0, total: exportPreviews.length, currentSkill: "" });
    try {
      const result = await skillSyncPresenter.executeExport(exportPreviews, conflictStrategies);
      if (result.success) {
        toast({
          title: "Export Successful",
          description: `Exported ${result.exported}, skipped ${result.skipped}`,
        });
        onComplete();
      } else {
        console.error("Export failures:", result.failed);
        const failureDetails = result.failed.map((f) => `${f.skill}: ${f.reason}`).join("\n");
        toast({
          title: "Export Partial",
          description: `Exported ${result.exported}, failed ${result.failed.length}\n\n${failureDetails}`,
          variant: "destructive",
          duration: 10000,
        });
        onComplete();
      }
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export Error", description: String(error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      await loadTools();
      onStepChange(2);
    } else if (currentStep === 2) {
      await previewExport();
      onStepChange(3);
    } else if (currentStep === 3) {
      await executeExport();
    }
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  useEffect(() => {
    const newState: Record<string, boolean> = {};
    for (const skill of localSkills) {
      newState[skill.name] = skillCheckedState[skill.name] ?? false;
    }
    setSkillCheckedState(newState);
  }, [localSkills]);

  useEffect(() => {
    if (currentStep === 1) {
      setSelectedToolId(null);
      setExportPreviews([]);
      setConflictStrategies({});
      setKiroInclusion("on-demand");
      setKiroFilePatterns("");
    }
  }, [currentStep]);

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
            <h3 className="text-sm font-medium mb-4">Select skills to export</h3>
            {loadingSkills ? (
              <div className="flex items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    Selected {selectedSkills.length} of {localSkills.length}
                  </div>
                  <Button variant="ghost" size="sm" onClick={toggleAllSkills}>
                    {allSkillsSelected ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <ScrollArea className="h-[280px] pr-4">
                  <div className="space-y-2">
                    {localSkills.map((skill) => (
                      <div
                        key={skill.name}
                        className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <Checkbox
                          checked={skillCheckedState[skill.name]}
                          onCheckedChange={(value) => updateSkillChecked(skill.name, Boolean(value))}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate">{skill.name}</span>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{skill.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Select target tool</h3>
            {scanningTools ? (
              <div className="flex items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  {availableTools.map((tool) => (
                    <div
                      key={tool.id}
                      className={[
                        "flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer",
                        selectedToolId === tool.id ? "border-primary bg-accent" : "",
                      ].join(" ")}
                      onClick={() => setSelectedToolId(tool.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={[
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            getToolIconBg(tool.id),
                          ].join(" ")}
                        >
                          <Icon icon={getToolIcon(tool.id)} className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{tool.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">{tool.skillsDir}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {isKiroSelected && (
                  <div className="p-4 border rounded-lg bg-pink-50/50 dark:bg-pink-900/10 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-pink-600 dark:text-pink-400">
                      <Icon icon="lucide:sparkles" className="w-4 h-4" />
                      Kiro Options
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Inclusion Mode</Label>
                      <RadioGroup
                        value={kiroInclusion}
                        onValueChange={(v) => setKiroInclusion(v as KiroInclusionMode)}
                        className="space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="on-demand" id="kiro-on-demand" className="mt-0.5" />
                          <div>
                            <Label htmlFor="kiro-on-demand" className="text-sm font-normal">
                              On Demand
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Include skill only when explicitly requested
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="always" id="kiro-always" className="mt-0.5" />
                          <div>
                            <Label htmlFor="kiro-always" className="text-sm font-normal">
                              Always
                            </Label>
                            <p className="text-xs text-muted-foreground">Always include this skill</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="conditional" id="kiro-conditional" className="mt-0.5" />
                          <div className="flex-1">
                            <Label htmlFor="kiro-conditional" className="text-sm font-normal">
                              Conditional
                            </Label>
                            <p className="text-xs text-muted-foreground">Include based on file patterns</p>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                    {kiroInclusion === "conditional" && (
                      <div className="space-y-2">
                        <Label htmlFor="kiro-patterns" className="text-sm">
                          File Patterns
                        </Label>
                        <Input
                          id="kiro-patterns"
                          value={kiroFilePatterns}
                          onChange={(e) => setKiroFilePatterns(e.target.value)}
                          placeholder="e.g. *.ts, *.tsx, src/**"
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Comma-separated glob patterns</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Preview and confirm</h3>
            {loading && (
              <div className="flex flex-col items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Previewing...</span>
              </div>
            )}
            {exporting && (
              <div className="flex flex-col items-center justify-center py-8">
                <Icon icon="lucide:loader-2" className="w-8 h-8 animate-spin text-primary mb-2" />
                <span className="text-sm text-muted-foreground">
                  Exporting {exportProgress.current}/{exportProgress.total}...
                </span>
                <span className="text-xs text-muted-foreground mt-1">{exportProgress.currentSkill}</span>
              </div>
            )}
            {!loading && !exporting && (
              <>
                {allWarnings.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium text-sm mb-2">
                      <Icon icon="lucide:alert-triangle" className="w-4 h-4" />
                      Warnings
                    </div>
                    <div className="space-y-1">
                      {allWarnings.map((warning, index) => (
                        <div key={index} className="text-xs text-amber-700 dark:text-amber-300">
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {conflictItems.length > 0 ? (
                  <ConflictResolver
                    conflicts={conflictItems}
                    strategies={conflictStrategies}
                    warnings={[]}
                    onStrategiesChange={setConflictStrategies}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Icon icon="lucide:check-circle" className="w-12 h-12 mx-auto mb-2 text-green-500" />
                    <p>No conflicts detected</p>
                    <p className="text-xs mt-1">Ready to export {selectedSkills.length} skill(s)</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t mt-4 flex-shrink-0">
        <Button variant="outline" onClick={handleBack} disabled={exporting}>
          {currentStep === 1 ? "Cancel" : "Back"}
        </Button>
        <Button onClick={handleNext} disabled={!canProceed || exporting}>
          {exporting && <Icon icon="lucide:loader-2" className="w-4 h-4 mr-2 animate-spin" />}
          {nextButtonText}
        </Button>
      </div>
    </div>
  );
};

export default ExportWizard;
