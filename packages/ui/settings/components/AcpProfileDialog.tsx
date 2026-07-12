import { useState, useEffect, useMemo, useCallback } from "react";
import { nanoid } from "nanoid";
import type { AcpAgentProfile } from "@argos/shared/presenter";
import { useToast } from "#/components/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Button } from "#shadcn/components/ui/button";

export type AcpProfilePayload = Omit<AcpAgentProfile, "id">;

type EnvRow = { id: string; key: string; value: string };
type ProfileKind = "builtin" | "custom";

interface AcpProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  kind: ProfileKind;
  profile?: AcpProfilePayload | null;
  saving?: boolean;
  confirmLabel?: string;
  onSave: (payload: AcpProfilePayload) => void;
}

const defaultDescription = (kind: ProfileKind) =>
  kind === "custom" ? "Configure a custom agent profile" : "Configure a built-in agent profile";

const nameLabel = (kind: ProfileKind) => (kind === "custom" ? "Agent Name" : "Profile Name");

const namePlaceholder = (kind: ProfileKind) => (kind === "custom" ? "Enter agent name" : "Enter profile name");

export default function AcpProfileDialog({
  open,
  onOpenChange,
  title,
  description: descProp,
  kind,
  profile,
  saving = false,
  confirmLabel,
  onSave,
}: AcpProfileDialogProps) {
  const { toast } = useToast();
  const [formName, setFormName] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgsInput, setFormArgsInput] = useState("");
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);

  const resolvedDescription = descProp ?? defaultDescription(kind);
  const confirmText = confirmLabel ?? "Save";

  const addEnvRow = useCallback(() => {
    setEnvRows((prev) => [...prev, { id: nanoid(6), key: "", value: "" }]);
  }, []);

  const removeEnvRow = useCallback((id: string) => {
    setEnvRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      if (!next.length) {
        return [{ id: nanoid(6), key: "", value: "" }];
      }
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormCommand("");
    setFormArgsInput("");
    setEnvRows([]);
    addEnvRow();
  }, [addEnvRow]);

  const initForm = useCallback(() => {
    if (!profile) {
      resetForm();
      return;
    }
    setFormName(profile.name);
    setFormCommand(profile.command);
    setFormArgsInput(profile.args?.join(" ") ?? "");
    const rows = profile.env ? Object.entries(profile.env).map(([key, value]) => ({ id: nanoid(6), key, value })) : [];
    setEnvRows(rows.length ? rows : [{ id: nanoid(6), key: "", value: "" }]);
  }, [profile, resetForm]);

  useEffect(() => {
    if (open) {
      initForm();
    } else {
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (open) initForm();
  }, [profile]);

  const parseArgs = (input: string): string[] => {
    const matches = input.match(/"[^"]*"|\S+/g) || [];
    return matches.map((arg) => arg.replace(/^"(.*)"$/, "$1")).filter((arg) => arg.trim().length > 0);
  };

  const buildEnv = (): Record<string, string> | undefined => {
    const env: Record<string, string> = {};
    envRows.forEach((row) => {
      if (row.key.trim()) {
        env[row.key.trim()] = row.value;
      }
    });
    return Object.keys(env).length ? env : undefined;
  };

  const handleSave = () => {
    if (!formName.trim() || !formCommand.trim()) {
      toast({
        title: "Missing required fields",
        description: "Name and command are required.",
        variant: "destructive",
      });
      return;
    }

    onSave({
      name: formName.trim(),
      command: formCommand.trim(),
      args: parseArgs(formArgsInput),
      env: buildEnv(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{nameLabel(kind)}</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={namePlaceholder(kind)} />
          </div>
          <div className="space-y-2">
            <Label>Command</Label>
            <Input value={formCommand} onChange={(e) => setFormCommand(e.target.value)} placeholder="Enter command" />
          </div>
          <div className="space-y-2">
            <Label>Arguments</Label>
            <Input
              value={formArgsInput}
              onChange={(e) => setFormArgsInput(e.target.value)}
              placeholder="Space-separated arguments"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Environment Variables</Label>
              <Button variant="ghost" size="sm" onClick={addEnvRow}>
                Add Variable
              </Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {envRows.map((row) => (
                <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    value={row.key}
                    onChange={(e) =>
                      setEnvRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))
                    }
                    className="col-span-5"
                    placeholder="Key"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) =>
                      setEnvRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
                    }
                    className="col-span-6"
                    placeholder="Value"
                  />
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeEnvRow(row.id)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
