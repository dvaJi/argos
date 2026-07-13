import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Textarea } from "#shadcn/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#shadcn/components/ui/sheet";

interface SystemPromptForm {
  id: string;
  name: string;
  content: string;
}

interface SystemPromptEditorSheetProps {
  open: boolean;
  prompt: SystemPromptForm | null;
  onUpdateOpen: (open: boolean) => void;
  onSave: (value: { id?: string; name: string; content: string }) => void;
}

export default function SystemPromptEditorSheet({ open, prompt, onUpdateOpen, onSave }: SystemPromptEditorSheetProps) {
  const [form, setForm] = useState<SystemPromptForm>({ id: "", name: "", content: "" });

  const isEditing = Boolean(form.id);

  const resetForm = () => setForm({ id: "", name: "", content: "" });

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    if (prompt) {
      setForm({ id: prompt.id, name: prompt.name, content: prompt.content });
    } else {
      resetForm();
    }
  }, [open, prompt]);

  const handleSave = () => {
    onSave({ id: form.id, name: form.name, content: form.content });
  };

  return (
    <Sheet open={open} onOpenChange={onUpdateOpen}>
      <SheetContent side="right" className="flex h-screen w-[60vw]! max-w-[90vw]! flex-col bg-background p-0">
        <SheetHeader className="shrink-0 border-b bg-card/50 px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Icon icon="lucide:settings" className="h-5 w-5 text-primary" />
            <span>{isEditing ? "Edit System Prompt" : "Add System Prompt"}</span>
          </SheetTitle>
          <SheetDescription>
            {isEditing ? "Modify the system prompt configuration." : "Create a new system prompt."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="system-prompt-name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="system-prompt-name"
                value={form.name}
                placeholder="Prompt name"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system-prompt-content" className="text-sm font-medium">
                Prompt Content
              </Label>
              <Textarea
                id="system-prompt-content"
                value={form.content}
                className="h-64 w-full"
                placeholder="Enter your prompt content here..."
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              />
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t bg-card/50 px-6 py-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-xs text-muted-foreground">{form.content.length} characters</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => onUpdateOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!form.name || !form.content} onClick={handleSave}>
                <Icon icon="lucide:save" className="mr-1 h-4 w-4" />
                Confirm
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
