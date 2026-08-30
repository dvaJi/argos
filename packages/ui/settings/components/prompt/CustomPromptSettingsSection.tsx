import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Label } from "#shadcn/components/ui/label";
import { useToast } from "#/components/use-toast";
import {
  promptsStore as promptsStoreInstance,
  loadCustomPrompts,
  addPrompt,
  updatePrompt,
  deletePrompt,
  savePrompts,
} from "#/stores/prompts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#shadcn/components/ui/alert-dialog";
import { downloadBlob } from "#/lib/download";
import PromptEditorSheet, { type PromptForm } from "./PromptEditorSheet";
import type { Prompt, FileItem } from "@argos/shared/presenter";
interface PromptParameter {
  name: string;
  description: string;
  required: boolean;
}
type PromptItem = Prompt;
const getSourceLabel = (source?: string) => {
  switch (source) {
    case "local":
      return "Local";
    case "imported":
      return "Imported";
    case "builtin":
      return "Built-in";
    default:
      return "Local";
  }
};
const safeClone = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(safeClone);
  const cloned: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = (obj as Record<string, unknown>)[key];
      if (typeof value !== "function" && typeof value !== "symbol" && typeof value !== "undefined") {
        cloned[key] = safeClone(value);
      }
    }
  }
  return cloned;
};
interface CustomPromptSettingsSectionHandle {
  importPrompts: () => void;
  exportPrompts: () => void;
}
const getContent = (prompt: PromptItem) => prompt.content ?? "";
const formatDate = (id: string) => {
  try {
    const timestamp = parseInt(id);
    if (isNaN(timestamp)) return "Custom";
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "Custom";
  }
};
interface CustomPromptSectionHeaderProps {
  onAdd: () => void;
}
function CustomPromptSectionHeader({ onAdd }: CustomPromptSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:book-open-text" className="h-5 w-5 text-primary" />
        <Label className="text-base font-medium">Custom Prompts</Label>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={onAdd}>
          <Icon icon="lucide:plus" className="mr-1 h-4 w-4" />
          Add Custom Prompt
        </Button>
      </div>
    </div>
  );
}
interface CustomPromptCardProps {
  prompt: PromptItem;
  index: number;
  isExpanded: boolean;
  onToggleShowMore: (id: string) => void;
  onToggleEnabled: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}
function CustomPromptCard({
  prompt,
  index,
  isExpanded,
  onToggleShowMore,
  onToggleEnabled,
  onEdit,
  onDelete,
}: CustomPromptCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted p-4 transition-colors duration-200 hover:border-primary/50">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2">
            <Icon icon="lucide:scroll-text" className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" title={prompt.name}>
              {prompt.name}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {getSourceLabel(prompt.source)}
              </span>
              <button
                type="button"
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs transition-colors ${prompt.enabled ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"}`}
                title={prompt.enabled ? "Click to disable" : "Click to enable"}
                onClick={() => onToggleEnabled(index)}
              >
                {prompt.enabled ? "Active" : "Inactive"}
              </button>
            </div>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit"
            onClick={() => onEdit(index)}
          >
            <Icon icon="lucide:pencil" className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                />
              }
            >
              <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{prompt.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(index)}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="mb-3 text-xs text-muted-foreground" title={prompt.description}>
        {prompt.description || "No description"}
      </div>
      <div className="relative mb-3">
        <div className="break-all rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
          {getContent(prompt)}
        </div>
        {getContent(prompt).length > 100 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-xs text-primary"
            onClick={() => onToggleShowMore(prompt.id)}
          >
            {isExpanded ? "Show Less" : "Show More"}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Icon icon="lucide:type" className="h-3 w-3" />
            <span>{getContent(prompt).length}</span>
          </div>
          {prompt.parameters && prompt.parameters.length > 0 && (
            <div className="flex items-center gap-1">
              <Icon icon="lucide:settings" className="h-3 w-3" />
              <span>{prompt.parameters!.length}</span>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{formatDate(prompt.id)}</div>
      </div>
    </div>
  );
}
const CustomPromptSettingsSection = forwardRef<CustomPromptSettingsSectionHandle>(
  function CustomPromptSettingsSection(_props, ref) {
    const { toast } = useToast();
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<PromptForm | null>(null);
    const loadPrompts = async () => {
      await loadCustomPrompts();
      setPrompts(
        promptsStoreInstance.state.prompts.map((p) => ({
          ...p,
        })),
      );
    };
    const isExpanded = (id: string) => expandedPrompts.has(id);
    const toggleShowMore = (id: string) => {
      setExpandedPrompts((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
    const togglePromptEnabled = async (index: number, updatedAt: number) => {
      const prompt = prompts[index];
      const newEnabled = !(prompt.enabled ?? true);
      setPrompts((prev) =>
        prev.map((p, i) =>
          i === index
            ? {
                ...p,
                enabled: newEnabled,
              }
            : p,
        ),
      );
      try {
        await updatePrompt(prompt.id, {
          enabled: newEnabled,
          updatedAt,
        });
        toast({
          title: newEnabled ? "Prompt enabled" : "Prompt disabled",
        });
      } catch (error) {
        console.error("Failed to toggle prompt:", error);
        await loadPrompts();
        toast({
          title: "Failed to toggle",
          variant: "destructive",
        });
      }
    };
    const handleDeletePrompt = async (index: number) => {
      const prompt = prompts[index];
      try {
        await deletePrompt(prompt.id as any);
        await loadPrompts();
        toast({
          title: "Prompt deleted",
        });
      } catch (error) {
        console.error("Failed to delete prompt:", error);
        toast({
          title: "Failed to delete",
          variant: "destructive",
        });
      }
    };
    const toPromptForm = (prompt: PromptItem): PromptForm => ({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      content: prompt.content ?? "",
      parameters: prompt.parameters
        ? prompt.parameters.map((p) => ({
            ...p,
          }))
        : [],
      files: prompt.files ? [...prompt.files] : [],
      enabled: prompt.enabled ?? true,
      source: prompt.source ?? "local",
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    });
    const editPrompt = (index: number) => {
      setEditingPrompt(toPromptForm(prompts[index]));
      setEditorOpen(true);
    };
    const handleEditorSubmit = async (prompt: PromptForm) => {
      const timestamp = Date.now();
      try {
        if (!prompt.id) {
          await addPrompt({
            ...prompt,
            id: timestamp.toString(),
            enabled: prompt.enabled ?? true,
            source: "local" as const,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        } else {
          await updatePrompt(prompt.id, {
            ...prompt,
            updatedAt: timestamp,
          });
        }
        await loadPrompts();
        setEditorOpen(false);
        setEditingPrompt(null);
      } catch (error) {
        console.error("Failed to save prompt:", error);
      }
    };
    const exportPrompts = () => {
      try {
        const data = JSON.stringify(
          prompts.map((p) => structuredClone(p)),
          null,
          2,
        );
        const blob = new Blob([data], {
          type: "application/json",
        });
        downloadBlob(blob, "prompts.json");
        toast({
          title: "Export successful",
        });
      } catch (error) {
        console.error("Failed to export prompts:", error);
        toast({
          title: "Export failed",
          variant: "destructive",
        });
      }
    };
    const importPrompts = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const imported = JSON.parse(content);
            if (!Array.isArray(imported)) {
              toast({
                title: "Import failed",
                description: "Invalid format",
                variant: "destructive",
              });
              return;
            }
            const current = [...prompts];
            const currentMap = new Map(current.map((p) => [p.id, p]));
            let updatedCount = 0;
            let addedCount = 0;
            for (const item of imported) {
              const timestamp = Date.now();
              if (!item.id) item.id = `${timestamp}${Math.random().toString(36).slice(2, 11)}`;
              if (!item.source) item.source = "imported";
              if (item.enabled === undefined) item.enabled = true;
              if (!item.createdAt) item.createdAt = timestamp;
              item.updatedAt = timestamp;
              if (currentMap.has(item.id)) {
                const idx = current.findIndex((p) => p.id === item.id);
                if (idx !== -1) {
                  current[idx] = item;
                  updatedCount++;
                }
              } else {
                current.push(item);
                addedCount++;
              }
            }
            await savePrompts(current.map((p) => safeClone(p) as PromptItem));
            await loadPrompts();
            toast({
              title: "Import successful",
              description: `${addedCount} added, ${updatedCount} updated`,
            });
          } catch (error) {
            toast({
              title: "Import failed",
              description: error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
          }
        };
        reader.onerror = () =>
          toast({
            title: "Import failed",
            variant: "destructive",
          });
        reader.readAsText(file);
      };
      input.click();
    };
    useImperativeHandle(
      ref,
      () => ({
        importPrompts,
        exportPrompts,
      }),
      [importPrompts, exportPrompts],
    );
    useEffect(() => {
      let cancelled = false;
      void (async () => {
        await loadCustomPrompts();
        if (cancelled) return;
        setPrompts(
          promptsStoreInstance.state.prompts.map((p) => ({
            ...p,
          })),
        );
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <CustomPromptSectionHeader
          onAdd={() => {
            setEditingPrompt(null);
            setEditorOpen(true);
          }}
        />

        {prompts.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Icon icon="lucide:book-open-text" className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-lg font-medium">No custom prompts</p>
            <p className="mt-1 text-sm">Create a custom prompt to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {prompts.map((prompt, index) => (
              <CustomPromptCard
                key={prompt.id}
                prompt={prompt}
                index={index}
                isExpanded={isExpanded(prompt.id)}
                onToggleShowMore={toggleShowMore}
                onToggleEnabled={(cardIndex) => void togglePromptEnabled(cardIndex, Date.now())}
                onEdit={editPrompt}
                onDelete={(cardIndex) => void handleDeletePrompt(cardIndex)}
              />
            ))}
          </div>
        )}

        <PromptEditorSheet
          open={editorOpen}
          prompt={editingPrompt}
          onUpdateOpen={(open) => {
            setEditorOpen(open);
            if (!open) setEditingPrompt(null);
          }}
          onSubmit={handleEditorSubmit}
        />
      </div>
    );
  },
);
export default CustomPromptSettingsSection;
