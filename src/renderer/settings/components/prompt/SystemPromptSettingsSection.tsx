import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Label } from "@shadcn/components/ui/label";
import { Textarea } from "@shadcn/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
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
} from "@shadcn/components/ui/alert-dialog";
import { useToast } from "@/components/use-toast";
import {
  useSystemPromptStore,
  loadSystemPrompts,
  addSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  setDefaultSystemPromptId,
} from "@/stores/systemPromptStore";
import SystemPromptEditorSheet from "./SystemPromptEditorSheet";

interface SystemPromptItem {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

const EMPTY_SYSTEM_PROMPT_ID = "empty";

const DEFAULT_SYSTEM_PROMPT_CONTENT = `You are DeepChat, a highly capable AI assistant. Your goal is to fully complete the user's requested task before handing the conversation back to them. Keep working autonomously until the task is fully resolved.
Be thorough in gathering information. Before replying, make sure you have all the details necessary to provide a complete solution. Use additional tools or ask clarifying questions when needed, but if you can find the answer on your own, avoid asking the user for help.
When using tools, briefly describe your intended steps first—for example, which tool you'll use and for what purpose.`;

export default function SystemPromptSettingsSection() {
  const { toast } = useToast();
  const systemPromptStore = useSystemPromptStore();

  const [systemPrompts, setSystemPrompts] = useState<SystemPromptItem[]>([]);
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState("");
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<SystemPromptItem | null>(null);
  const [systemPromptEditorOpen, setSystemPromptEditorOpen] = useState(false);
  const [editingSystemPrompt, setEditingSystemPrompt] = useState<SystemPromptItem | null>(null);

  const isEmptyPromptSelected = selectedSystemPromptId === EMPTY_SYSTEM_PROMPT_ID;

  const selectableSystemPrompts = useMemo(
    () => [{ id: EMPTY_SYSTEM_PROMPT_ID, name: "None (Empty)", content: "" }, ...systemPrompts],
    [systemPrompts],
  );

  const updateCurrentSystemPrompt = useCallback(() => {
    if (isEmptyPromptSelected) {
      setCurrentSystemPrompt(null);
      return;
    }
    setCurrentSystemPrompt(systemPrompts.find((p) => p.id === selectedSystemPromptId) || null);
  }, [isEmptyPromptSelected, systemPrompts, selectedSystemPromptId]);

  const fetchSystemPrompts = useCallback(async () => {
    try {
      await loadSystemPrompts();
      setSystemPrompts([...systemPromptStore.prompts]);
      setSelectedSystemPromptId(systemPromptStore.defaultPromptId);
    } catch (error) {
      console.error("Failed to load system prompts:", error);
    }
  }, [systemPromptStore]);

  const handleSystemPromptChange = useCallback(
    async (promptId: string) => {
      try {
        await setDefaultSystemPromptId(promptId);
        setSelectedSystemPromptId(promptId);
        if (promptId === EMPTY_SYSTEM_PROMPT_ID) {
          setSystemPrompts((prev) => prev.map((p) => ({ ...p, isDefault: false })));
          setCurrentSystemPrompt(null);
          return;
        }
        setSystemPrompts((prev) => prev.map((p) => ({ ...p, isDefault: p.id === promptId })));
        updateCurrentSystemPrompt();
      } catch (error) {
        console.error("Failed to change default system prompt:", error);
        toast({ title: "Failed to save", variant: "destructive" });
      }
    },
    [systemPromptStore, toast, updateCurrentSystemPrompt],
  );

  const saveCurrentSystemPrompt = useCallback(async () => {
    if (!currentSystemPrompt) return;
    try {
      await updateSystemPrompt(currentSystemPrompt.id, {
        content: currentSystemPrompt.content,
        updatedAt: Date.now(),
      });
      setSystemPrompts((prev) =>
        prev.map((p) =>
          p.id === currentSystemPrompt.id ? { ...p, content: currentSystemPrompt.content, updatedAt: Date.now() } : p,
        ),
      );
      toast({ title: "System prompt updated" });
    } catch (error) {
      console.error("Failed to save system prompt:", error);
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }, [currentSystemPrompt, systemPromptStore, toast]);

  const resetDefaultSystemPrompt = useCallback(async () => {
    try {
      await updateSystemPrompt("default", {
        content: DEFAULT_SYSTEM_PROMPT_CONTENT,
        updatedAt: Date.now(),
      });
      if (currentSystemPrompt?.id === "default") {
        setCurrentSystemPrompt((prev) => (prev ? { ...prev, content: DEFAULT_SYSTEM_PROMPT_CONTENT } : null));
      }
      setSystemPrompts((prev) =>
        prev.map((p) =>
          p.id === "default" ? { ...p, content: DEFAULT_SYSTEM_PROMPT_CONTENT, updatedAt: Date.now() } : p,
        ),
      );
      toast({ title: "Reset to default" });
    } catch (error) {
      console.error("Failed to reset system prompt:", error);
      toast({ title: "Failed to reset", variant: "destructive" });
    }
  }, [currentSystemPrompt, systemPromptStore, toast]);

  const handleDeleteSystemPrompt = useCallback(
    async (promptId: string) => {
      try {
        await deleteSystemPrompt(promptId);
        await fetchSystemPrompts();
        toast({ title: "System prompt deleted" });
      } catch (error) {
        console.error("Failed to delete system prompt:", error);
        toast({ title: "Failed to delete", variant: "destructive" });
      }
    },
    [systemPromptStore, fetchSystemPrompts, toast],
  );

  const handleSaveSystemPrompt = useCallback(
    async ({ id, name, content }: { id?: string; name: string; content: string }) => {
      const timestamp = Date.now();
      try {
        if (id) {
          await updateSystemPrompt(id, { name, content, updatedAt: timestamp });
        } else {
          const newId = timestamp.toString();
          await addSystemPrompt({
            id: newId,
            name,
            content,
            isDefault: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          await setDefaultSystemPromptId(newId);
        }
        await fetchSystemPrompts();
        setSystemPromptEditorOpen(false);
        setEditingSystemPrompt(null);
        toast({ title: id ? "System prompt updated" : "System prompt added and switched" });
      } catch (error) {
        console.error("Failed to save system prompt:", error);
        toast({ title: "Failed to save", variant: "destructive" });
      }
    },
    [systemPromptStore, fetchSystemPrompts, toast],
  );

  useEffect(() => {
    void fetchSystemPrompts();
  }, [fetchSystemPrompts]);

  useEffect(() => {
    updateCurrentSystemPrompt();
  }, [updateCurrentSystemPrompt]);

  return (
    <div className="space-y-3">
      <div className="flex flex-row items-center gap-2">
        <div className="flex-1">
          <Label className="text-sm font-medium flex-1">Default System Prompt</Label>
          <p className="text-xs text-muted-foreground">Configure the default system prompt used for conversations.</p>
        </div>
        <Select value={selectedSystemPromptId} onValueChange={handleSystemPromptChange}>
          <SelectTrigger className="h-8! w-32 border-border hover:bg-accent">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {selectableSystemPrompts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => {
            setEditingSystemPrompt(null);
            setSystemPromptEditorOpen(true);
          }}
        >
          <Icon icon="lucide:plus" className="h-4 w-4" />
        </Button>
      </div>

      {isEmptyPromptSelected && (
        <div className="rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            No system prompt will be used. The model will use its default behavior.
          </p>
        </div>
      )}

      {currentSystemPrompt && (
        <div className="space-y-2">
          <Textarea
            value={currentSystemPrompt.content}
            className="h-48 w-full"
            placeholder="Enter prompt content..."
            onChange={(e) => setCurrentSystemPrompt((prev) => (prev ? { ...prev, content: e.target.value } : null))}
            onBlur={() => void saveCurrentSystemPrompt()}
          />
          <div className="flex items-center gap-2">
            {currentSystemPrompt.id === "default" ? (
              <Button variant="outline" size="sm" onClick={() => void resetDefaultSystemPrompt()}>
                <Icon icon="lucide:rotate-ccw" className="mr-1 h-3.5 w-3.5" />
                Reset to Default
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Icon icon="lucide:trash-2" className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &quot;{currentSystemPrompt.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDeleteSystemPrompt(currentSystemPrompt.id)}>
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}

      <SystemPromptEditorSheet
        open={systemPromptEditorOpen}
        prompt={editingSystemPrompt}
        onUpdateOpen={(open) => {
          setSystemPromptEditorOpen(open);
          if (!open) setEditingSystemPrompt(null);
        }}
        onSave={handleSaveSystemPrompt}
      />
    </div>
  );
}
