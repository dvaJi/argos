import { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import type { LLM_PROVIDER } from "@shared/presenter";
import { useProviderStore } from "@/stores/providerStore";

interface AddCustomProviderDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onProviderAdded?: (provider: LLM_PROVIDER) => void;
}

const DEFAULT_FORM: LLM_PROVIDER = {
  id: "",
  name: "",
  apiType: "openai",
  apiKey: "",
  baseUrl: "",
  enable: true,
};

export default function AddCustomProviderDialog({ open, onOpenChange, onProviderAdded }: AddCustomProviderDialogProps) {
  const providerStore = useProviderStore();

  const [isOpen, setIsOpen] = useState(open);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<LLM_PROVIDER>({ ...DEFAULT_FORM });

  const apiEndpointSuffix = (() => {
    if (formData.apiType === "openai") return "/responses";
    if (formData.apiType === "openai-completions") return "/chat/completions";
    return "";
  })();

  useEffect(() => {
    if (open && !isOpen) {
      setFormData({ ...DEFAULT_FORM });
    }
    setIsOpen(open);
  }, [open]);

  useEffect(() => {
    onOpenChange(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (formData.apiType === "ollama") {
      if (!formData.baseUrl) {
        setFormData((prev) => ({ ...prev, baseUrl: "http://localhost:11434" }));
      }
      setFormData((prev) => ({ ...prev, apiKey: "" }));
    }
  }, [formData.apiType]);

  const resetForm = () => {
    setFormData({ ...DEFAULT_FORM });
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      formData.id = nanoid();
      closeDialog();
      await providerStore.addCustomProvider(formData);
      onProviderAdded?.(formData);
    } catch (error) {
      console.error("Failed to add custom provider:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(val) => {
        setIsOpen(val);
        if (!val) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Custom Provider</DialogTitle>
          <DialogDescription>Add a new custom provider to use with your own API.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
                placeholder="Provider name"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiType" className="text-right">
                API Type
              </Label>
              <Select
                value={formData.apiType}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, apiType: value as LLM_PROVIDER["apiType"] }))
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select API type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="openai-completions">OpenAI Completions</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="mistral">Mistral AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiKey" className="text-right">
                API Key
              </Label>
              <Input
                id="apiKey"
                value={formData.apiKey}
                onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                className="col-span-3"
                placeholder="Enter API key"
                required={formData.apiType !== "ollama"}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="baseUrl" className="text-right">
                Base URL
              </Label>
              <span className="col-span-3 flex flex-col">
                <Input
                  id="baseUrl"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  className="col-span-3"
                  placeholder="Enter base URL"
                  required
                />
                {apiEndpointSuffix && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {`${formData.baseUrl ?? ""}${apiEndpointSuffix}`}
                  </div>
                )}
              </span>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="enable" className="text-right">
                Enable
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="enable"
                  checked={formData.enable}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enable: checked }))}
                />
                <Label htmlFor="enable">{formData.enable ? "Enabled" : "Disabled"}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
