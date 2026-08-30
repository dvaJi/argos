import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { getRuntimePathForFile } from "#api/runtime";
import { Button } from "#shadcn/components/ui/button";
import { Label } from "#shadcn/components/ui/label";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Input } from "#shadcn/components/ui/input";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#shadcn/components/ui/sheet";
import { useToast } from "#/components/use-toast";
import { createFileClient } from "#api/FileClient";
import { nanoid } from "nanoid";
import { getMimeTypeIcon } from "#/lib/utils";
import type { FileItem } from "@argos/shared/presenter";
import type { MessageFile } from "@argos/shared/chat";
interface PromptParameter {
  name: string;
  description: string;
  required: boolean;
}

/** PromptParameter plus a transient list key; stripped before submit. */
interface EditablePromptParameter extends PromptParameter {
  id: string;
}
export interface PromptForm {
  id: string;
  name: string;
  description: string;
  content: string;
  parameters: PromptParameter[];
  files: FileItem[];
  enabled: boolean;
  source: "local" | "imported" | "builtin";
  createdAt?: number;
  updatedAt?: number;
}
interface EditablePromptForm extends PromptForm {
  parameters: EditablePromptParameter[];
}
interface PromptEditorSheetProps {
  open: boolean;
  prompt: PromptForm | null;
  onUpdateOpen: (open: boolean) => void;
  onSubmit: (value: PromptForm) => void;
}
const defaultForm: EditablePromptForm = {
  id: "",
  name: "",
  description: "",
  content: "",
  parameters: [],
  files: [],
  enabled: true,
  source: "local",
  createdAt: undefined,
  updatedAt: undefined,
};
export default function PromptEditorSheet({ open, prompt, onUpdateOpen, onSubmit }: PromptEditorSheetProps) {
  const { toast } = useToast();
  const fileClient = createFileClient();
  const [form, setForm] = useState<EditablePromptForm>({
    ...defaultForm,
  });
  const isEditing = Boolean(form.id);
  const resetForm = () => {
    setForm({
      ...defaultForm,
    });
  };
  const applyPrompt = (p: PromptForm | null) => {
    if (!p) {
      setForm({
        ...defaultForm,
      });
      return;
    }
    setForm({
      ...p,
      parameters:
        p.parameters?.map((param) => ({
          ...param,
          id: nanoid(6),
        })) || [],
      files: p.files ? [...p.files] : [],
      enabled: p.enabled ?? true,
      source: p.source ?? "local",
    });
  };

  // Sync the form with the requested prompt; reset when the sheet closes
  // (adjusted during render so the React Compiler can track it).
  const [syncedOpen, setSyncedOpen] = useState(open);
  const [syncedPrompt, setSyncedPrompt] = useState(prompt);
  if (syncedOpen !== open || syncedPrompt !== prompt) {
    setSyncedOpen(open);
    setSyncedPrompt(prompt);
    if (!open) {
      resetForm();
    } else {
      applyPrompt(prompt);
    }
  }
  const handleOpenChange = (value: boolean) => {
    onUpdateOpen(value);
    if (!value) resetForm();
  };
  const addParameter = () => {
    setForm((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        {
          id: nanoid(6),
          name: "",
          description: "",
          required: true,
        },
      ],
    }));
  };
  const removeParameter = (index: number) => {
    setForm((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  };
  const updateParameter = (index: number, field: keyof PromptParameter, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) =>
        i === index
          ? {
              ...p,
              [field]: value,
            }
          : p,
      ),
    }));
  };
  const uploadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".txt,.md,.csv,.json,.xml,.pdf,.doc,.docx";
    input.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (!files) return;
      try {
        const newFiles: FileItem[] = [];
        await Promise.all(
          Array.from(files).map(async (file) => {
            const path = getRuntimePathForFile(file);
            const mimeType = await fileClient.getMimeType(path);
            const fileInfo = (await fileClient.prepareFile(path, mimeType)) as unknown as MessageFile;
            newFiles.push({
              id: nanoid(8),
              name: fileInfo.name,
              type: fileInfo.mimeType,
              size: fileInfo.metadata.fileSize,
              path: fileInfo.path,
              description: fileInfo.metadata.fileDescription,
              content: fileInfo.content,
              createdAt: Date.now(),
            });
          }),
        );
        setForm((prev) => ({
          ...prev,
          files: [...prev.files, ...newFiles],
        }));
        toast({
          title: "Upload successful",
          description: `${files.length} file(s) uploaded`,
        });
      } catch (error) {
        console.error("Failed to upload prompt attachments:", error);
        toast({
          title: "Upload failed",
          variant: "destructive",
        });
      }
    };
    input.click();
  };
  const removeFile = (index: number) => {
    setForm((prev) => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
  };
  const submit = () => {
    onSubmit({
      ...form,
      // Strip the transient list keys; the persisted shape stays PromptParameter[]
      parameters: form.parameters.map(({ id: _id, ...param }) => ({
        ...param,
      })),
      files: [...form.files],
    });
  };
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex h-screen w-[75vw]! max-w-[95vw]! flex-col bg-background p-0">
        <SheetHeader className="shrink-0 border-b bg-card/50 px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Icon icon={isEditing ? "lucide:edit-3" : "lucide:plus-circle"} className="h-5 w-5 text-primary" />
            <span>{isEditing ? "Edit Prompt" : "Add Prompt"}</span>
          </SheetTitle>
          <SheetDescription>
            {isEditing ? "Modify your custom prompt." : "Create a new custom prompt."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6">
            <PromptBasicInfoSection
              name={form.name}
              description={form.description}
              enabled={form.enabled}
              onNameChange={(name) =>
                setForm((prev) => ({
                  ...prev,
                  name,
                }))
              }
              onDescriptionChange={(description) =>
                setForm((prev) => ({
                  ...prev,
                  description,
                }))
              }
              onEnabledChange={(enabled) =>
                setForm((prev) => ({
                  ...prev,
                  enabled,
                }))
              }
            />

            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Icon icon="lucide:file-text" className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium text-muted-foreground">Prompt Content</Label>
              </div>
              <Textarea
                value={form.content}
                className="min-h-48 w-full resize-y font-mono"
                placeholder="Enter your prompt content here..."
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">Use {"{parameterName}"} for dynamic parameters.</p>
            </div>

            <PromptParametersSection
              parameters={form.parameters}
              onAdd={addParameter}
              onRemove={removeParameter}
              onUpdate={updateParameter}
            />

            <PromptFilesSection files={form.files} onUpload={uploadFile} onRemove={removeFile} />
          </div>
        </ScrollArea>

        <SheetFooter className="border-t bg-card/50 px-6 py-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-xs text-muted-foreground">{form.content.length} characters</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => onUpdateOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!form.name || !form.content} onClick={submit}>
                <Icon icon={isEditing ? "lucide:save" : "lucide:plus"} className="mr-1 h-4 w-4" />
                Confirm
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};
interface PromptBasicInfoSectionProps {
  name: string;
  description: string;
  enabled: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onEnabledChange: (enabled: boolean) => void;
}

/** Name / description fields plus the enabled toggle. */
function PromptBasicInfoSection({
  name,
  description,
  enabled,
  onNameChange,
  onDescriptionChange,
  onEnabledChange,
}: PromptBasicInfoSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Label className="text-sm font-medium text-muted-foreground">Basic Info</Label>
      </div>
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Name</Label>
          <Input
            value={name}
            placeholder="Prompt name"
            className="mt-2"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-sm font-medium">Description</Label>
          <Input
            value={description}
            placeholder="Prompt description"
            className="mt-2"
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Checkbox id="prompt-enabled" checked={enabled} onCheckedChange={(value) => onEnabledChange(value === true)} />
        <Label htmlFor="prompt-enabled" className="text-sm">
          Enable this prompt
        </Label>
      </div>
    </div>
  );
}
interface PromptParametersSectionProps {
  parameters: EditablePromptParameter[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof PromptParameter, value: string | boolean) => void;
}

/** Parameter list editor with add/remove and per-row fields. */
function PromptParametersSection({ parameters, onAdd, onRemove, onUpdate }: PromptParametersSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:settings" className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium text-muted-foreground">Parameters</Label>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Icon icon="lucide:plus" className="mr-1 h-4 w-4" />
          Add Parameter
        </Button>
      </div>
      {parameters.length > 0 ? (
        <div className="space-y-4">
          {parameters.map((param, index) => (
            <PromptParameterRow key={param.id} param={param} index={index} onRemove={onRemove} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No parameters defined.</div>
      )}
    </div>
  );
}
interface PromptParameterRowProps {
  param: EditablePromptParameter;
  index: number;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof PromptParameter, value: string | boolean) => void;
}

/** A single editable prompt-parameter card. */
function PromptParameterRow({ param, index, onRemove, onUpdate }: PromptParameterRowProps) {
  return (
    <div className="relative rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 h-7 w-7 border border-border/50 bg-background/80 text-muted-foreground transition-colors duration-200 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
        title="Delete"
        onClick={() => onRemove(index)}
      >
        <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" />
      </Button>
      <div className="space-y-4 pr-12">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label className="text-sm text-muted-foreground">Parameter Name</Label>
            <Input
              value={param.name}
              placeholder="Parameter name"
              className="mt-2"
              onChange={(e) => onUpdate(index, "name", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`parameter-required-${index}`}
              checked={param.required}
              onCheckedChange={(value) => onUpdate(index, "required", value === true)}
            />
            <Label htmlFor={`parameter-required-${index}`} className="whitespace-nowrap text-sm">
              Required
            </Label>
          </div>
        </div>
        <div>
          <Label className="text-sm text-muted-foreground">Description</Label>
          <Input
            value={param.description}
            placeholder="Parameter description"
            className="mt-2"
            onChange={(e) => onUpdate(index, "description", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
interface PromptFilesSectionProps {
  files: FileItem[];
  onUpload: () => void;
  onRemove: (index: number) => void;
}

/** Attachment upload zone plus the uploaded-file grid / empty state. */
function PromptFilesSection({ files, onUpload, onRemove }: PromptFilesSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Icon icon="lucide:paperclip" className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium text-muted-foreground">File Management</Label>
      </div>
      <div className="space-y-4">
        <PromptFileUploadZone onUpload={onUpload} />
        {files.length > 0 ? (
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">Uploaded Files</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file, index) => (
                <PromptFileCard key={file.id} file={file} onRemove={() => onRemove(index)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-muted bg-muted/20 py-12 text-center text-muted-foreground">
            <Icon icon="lucide:folder-open" className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p className="text-sm">No files attached</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Upload files to include with this prompt</p>
          </div>
        )}
      </div>
    </div>
  );
}
function PromptFileUploadZone({ onUpload }: { onUpload: () => void }) {
  return (
    <div
      className="group cursor-pointer rounded-lg border-2 border-dashed border-muted p-4 transition-colors hover:border-primary/50 hover:bg-muted/20"
      onClick={onUpload}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onUpload();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-lg bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
          <Icon icon="lucide:upload" className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Upload from device</p>
          <p className="text-xs text-muted-foreground">Attach files to use with this prompt</p>
        </div>
      </div>
    </div>
  );
}
interface PromptFileCardProps {
  file: FileItem;
  onRemove: () => void;
}

/** One uploaded attachment card with mime-type icon and size. */
function PromptFileCard({ file, onRemove }: PromptFileCardProps) {
  return (
    <div className="group relative rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 border border-border/50 bg-background/80 text-muted-foreground opacity-0 transition-opacity duration-200 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
        title="Delete"
        onClick={onRemove}
      >
        <Icon icon="lucide:trash-2" className="h-3 w-3" />
      </Button>
      <div className="pr-8">
        <div className="mb-2 flex items-center gap-2">
          <div className="rounded bg-primary/10 p-1.5">
            <Icon icon={getMimeTypeIcon(file.type)} className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex-1 truncate whitespace-nowrap rounded bg-muted px-2 py-0.5 text-ellipsis">
            {file.type || "unknown"}
          </span>
          <span className="shrink-0">{formatFileSize(file.size)}</span>
        </div>
      </div>
    </div>
  );
}
