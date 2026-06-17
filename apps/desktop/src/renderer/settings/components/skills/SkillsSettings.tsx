import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Separator } from "@shadcn/components/ui/separator";
import { Switch } from "@shadcn/components/ui/switch";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shadcn/components/ui/alert-dialog";
import { useToast } from "@/components/use-toast";
import { useSkillsStore, loadSkills, uninstallSkill } from "@/stores/skillsStore";
import { useLegacyPresenter } from "@api/legacy/presenters";
import type { SkillMetadata } from "@shared/types/skill";
import SkillCard from "./SkillCard";
import SkillInstallDialog from "./SkillInstallDialog";
import SkillEditorSheet from "./SkillEditorSheet";
import SyncStatusSection from "./SyncStatusSection";
import SyncPromptDialog from "./SyncPromptDialog";
import { SkillSyncDialog } from "./SkillSyncDialog";
import SettingsPageShell from "../control-center/SettingsPageShell";

export default function SkillsSettings() {
  const { toast } = useToast();
  const skillsStore = useSkillsStore();
  const configPresenter = useLegacyPresenter("configPresenter");

  const [searchQuery, setSearchQuery] = useState("");
  const [draftSuggestionsEnabled, setDraftSuggestionsEnabled] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<"import" | "export">("import");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillMetadata | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<SkillMetadata | null>(null);

  const skills = skillsStore.skills;
  const loading = skillsStore.loading;

  const filteredSkills = useMemo(() => {
    if (!searchQuery) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [skills, searchQuery]);

  useEffect(() => {
    const init = async () => {
      const enabled = await configPresenter.getSkillDraftSuggestionsEnabled?.();
      setDraftSuggestionsEnabled(enabled ?? false);
      await loadSkills();
    };
    init();

    const handleSkillEvent = () => loadSkills();
    const offInstalled = window.electron?.ipcRenderer?.on("skill:installed", handleSkillEvent);
    const offUninstalled = window.electron?.ipcRenderer?.on("skill:uninstalled", handleSkillEvent);
    const offMetadata = window.electron?.ipcRenderer?.on("skill:metadata-updated", handleSkillEvent);
    return () => {
      offInstalled?.();
      offUninstalled?.();
      offMetadata?.();
    };
  }, []);

  const openEditor = (skill: SkillMetadata) => {
    setEditingSkill(skill);
    setEditorOpen(true);
  };
  const confirmDelete = (skill: SkillMetadata) => {
    setDeletingSkill(skill);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingSkill) return;
    const result = await uninstallSkill(deletingSkill.name);
    if (result.success) {
      toast({ title: "Skill deleted", description: `"${deletingSkill.name}" removed` });
    } else {
      toast({ title: "Delete failed", description: result.error, variant: "destructive" });
    }
    setDeleteDialogOpen(false);
    setDeletingSkill(null);
  };

  const handleDraftSuggestionsToggle = async (value: boolean | string) => {
    const normalized = typeof value === "string" ? value === "true" : Boolean(value);
    setDraftSuggestionsEnabled(normalized);
    await configPresenter.setSkillDraftSuggestionsEnabled?.(normalized);
  };

  return (
    <>
      <SettingsPageShell
        title="Skills"
        description="Manage agent skills"
        eyebrow="Knowledge"
        data-testid="settings-skills-page"
      >
        <template slot="actions">
          <div className="relative">
            <Icon
              icon="lucide:search"
              className="absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="h-8 w-48 pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSyncMode("export");
              setSyncDialogOpen(true);
            }}
          >
            <Icon icon="lucide:upload" className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button size="sm" onClick={() => setInstallDialogOpen(true)}>
            <Icon icon="lucide:plus" className="w-4 h-4 mr-1" />
            Add Skill
          </Button>
        </template>

        <div>
          <Separator className="my-4" />

          <div className="mb-4 rounded-lg border px-4 py-3 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Draft Suggestions</div>
              <p className="text-xs text-muted-foreground">Show skill suggestions from external tools</p>
            </div>
            <Switch checked={draftSuggestionsEnabled} onCheckedChange={handleDraftSuggestionsToggle} />
          </div>

          <div className="mb-4">
            <SyncStatusSection
              onImport={() => {
                setSyncMode("import");
                setSyncDialogOpen(true);
              }}
            />
          </div>

          <Separator className="mb-4" />

          {loading && (
            <div className="space-y-3 pb-4 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-xl border p-4">
                  <div className="space-y-3">
                    <div className="h-4 w-40 rounded bg-muted/60" />
                    <div className="h-3 w-full rounded bg-muted/40" />
                    <div className="h-3 w-3/4 rounded bg-muted/30" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredSkills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8">
              <Icon icon="lucide:wand-sparkles" className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm">{searchQuery ? "No results" : "No skills installed"}</p>
            </div>
          )}

          {!loading && filteredSkills.length > 0 && (
            <div className="flex flex-col gap-2 pb-4">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  extension={skillsStore.skillExtensions[skill.name]}
                  scripts={skillsStore.skillScripts[skill.name] || []}
                  onEdit={() => openEditor(skill)}
                  onDelete={() => confirmDelete(skill)}
                />
              ))}
            </div>
          )}
        </div>

        <SkillInstallDialog
          open={installDialogOpen}
          onOpenChange={setInstallDialogOpen}
          onInstalled={() => loadSkills()}
        />
        <SkillSyncDialog
          open={syncDialogOpen}
          onOpenChange={setSyncDialogOpen}
          mode={syncMode}
          onCompleted={() => loadSkills()}
        />
        <SkillEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          skill={editingSkill}
          onSaved={() => loadSkills()}
        />
        <SyncPromptDialog
          onImport={() => {
            setSyncMode("import");
            setSyncDialogOpen(true);
          }}
          onClose={() => {}}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Skill</AlertDialogTitle>
              <AlertDialogDescription>Delete "{deletingSkill?.name}"?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsPageShell>
    </>
  );
}
