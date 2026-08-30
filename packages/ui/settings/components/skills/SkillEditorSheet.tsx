import { useState, useEffect, useRef, useReducer } from "react";
import { nanoid } from "nanoid";
import * as yaml from "yaml";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Separator } from "#shadcn/components/ui/separator";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Badge } from "#shadcn/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Switch } from "#shadcn/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#shadcn/components/ui/sheet";
import { useToast } from "#/components/use-toast";
import { useSkillsStore, loadSkillRuntime, saveSkillWithExtension } from "#/stores/skillsStore";
import { createSkillClient } from "#api/SkillClient";
import type {
  SkillExtensionConfig,
  SkillMetadata,
  SkillRuntimePreference,
  SkillScriptDescriptor,
} from "@argos/shared/types/skill";
import SkillFolderTree from "./SkillFolderTree";
const skillClient = createSkillClient();
type EnvRow = {
  id: string;
  key: string;
  value: string;
};
type EditableScript = SkillScriptDescriptor & {
  description: string;
};
type SkillRuntimeState = {
  pythonRuntime: SkillRuntimePreference;
  nodeRuntime: SkillRuntimePreference;
  envRows: EnvRow[];
  scriptRows: EditableScript[];
  loaded: boolean;
};
type SkillRuntimeAction =
  | {
      type: "LOADED";
      pythonRuntime: SkillRuntimePreference;
      nodeRuntime: SkillRuntimePreference;
      envRows: EnvRow[];
      scriptRows: EditableScript[];
    }
  | { type: "SET_PYTHON_RUNTIME"; value: SkillRuntimePreference }
  | { type: "SET_NODE_RUNTIME"; value: SkillRuntimePreference }
  | { type: "ADD_ENV_ROW"; id: string }
  | { type: "REMOVE_ENV_ROW"; id: string; fallbackId: string }
  | { type: "UPDATE_ENV_ROW"; id: string; key?: string; value?: string }
  | { type: "SET_SCRIPT_ENABLED"; relativePath: string; enabled: boolean };
const blankEnvRow = (id: string): EnvRow => ({
  id,
  key: "",
  value: "",
});
const createInitialSkillRuntimeState = (): SkillRuntimeState => ({
  pythonRuntime: "auto",
  nodeRuntime: "auto",
  envRows: [blankEnvRow(nanoid(6))],
  scriptRows: [],
  loaded: false,
});
const skillRuntimeReducer = (state: SkillRuntimeState, action: SkillRuntimeAction): SkillRuntimeState => {
  switch (action.type) {
    case "LOADED":
      return {
        pythonRuntime: action.pythonRuntime,
        nodeRuntime: action.nodeRuntime,
        envRows: action.envRows,
        scriptRows: action.scriptRows,
        loaded: true,
      };
    case "SET_PYTHON_RUNTIME":
      return { ...state, pythonRuntime: action.value };
    case "SET_NODE_RUNTIME":
      return { ...state, nodeRuntime: action.value };
    case "ADD_ENV_ROW":
      return { ...state, envRows: [...state.envRows, blankEnvRow(action.id)] };
    case "REMOVE_ENV_ROW": {
      const next = state.envRows.filter((row) => row.id !== action.id);
      return { ...state, envRows: next.length ? next : [blankEnvRow(action.fallbackId)] };
    }
    case "UPDATE_ENV_ROW":
      return {
        ...state,
        envRows: state.envRows.map((row) =>
          row.id === action.id
            ? {
                ...row,
                key: action.key ?? row.key,
                value: action.value ?? row.value,
              }
            : row,
        ),
      };
    case "SET_SCRIPT_ENABLED":
      return {
        ...state,
        scriptRows: state.scriptRows.map((script) =>
          script.relativePath === action.relativePath
            ? {
                ...script,
                enabled: action.enabled,
              }
            : script,
        ),
      };
  }
};
interface SkillEditorSheetProps {
  skill: SkillMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}
interface SkillEditorFormProps {
  skill: SkillMetadata;
  onSaved: () => void;
  onClose: () => void;
}
function parseSkillContent(content: string | null): string {
  if (!content) return "";
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (!inFrontmatter) inFrontmatter = true;
      else {
        frontmatterEnd = i + 1;
        break;
      }
    }
  }
  return lines.slice(frontmatterEnd).join("\n").trim();
}
const SkillEditorForm = function SkillEditorForm({ skill, onSaved, onClose }: SkillEditorFormProps) {
  const { toast } = useToast();
  const skillsStore = useSkillsStore();
  const [editName] = useState(skill.name);
  const [editDescription, setEditDescription] = useState(skill.description);
  const [editAllowedTools, setEditAllowedTools] = useState(() => skill.allowedTools?.join(", ") || "");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [runtime, dispatchRuntime] = useReducer(skillRuntimeReducer, undefined, createInitialSkillRuntimeState);
  const loadRequestId = useRef(0);
  const skillsStoreRef = useRef(skillsStore);
  useEffect(() => {
    skillsStoreRef.current = skillsStore;
  }, [skillsStore]);
  useEffect(() => {
    const rid = ++loadRequestId.current;
    const name = skill.name;
    skillClient
      .readSkillFile(name)
      .then((content: string) => {
        if (loadRequestId.current !== rid) return;
        setEditContent(parseSkillContent(content));
      })
      .catch(() => {});
    loadSkillRuntime(name).then(() => {
      if (loadRequestId.current !== rid) return;
      const ext = skillsStoreRef.current.skillExtensions[name] ?? {
        version: 1,
        env: {},
        runtimePolicy: {
          python: "auto",
          node: "auto",
        },
        scriptOverrides: {},
      };
      const rows = Object.entries(ext.env).map(([k, v]) => ({
        id: nanoid(6),
        key: k,
        value: v,
      }));
      dispatchRuntime({
        type: "LOADED",
        pythonRuntime: ext.runtimePolicy.python,
        nodeRuntime: ext.runtimePolicy.node,
        envRows: rows.length ? rows : [blankEnvRow(nanoid(6))],
        scriptRows: (skillsStoreRef.current.skillScripts[name] ?? []).map((s) => ({
          ...s,
          description: s.description ?? "",
        })),
      });
    });
    return () => {
      loadRequestId.current++;
    };
  }, [skill.name]);
  const addEnvRow = () => dispatchRuntime({ type: "ADD_ENV_ROW", id: nanoid(6) });
  const removeEnvRow = (id: string) => dispatchRuntime({ type: "REMOVE_ENV_ROW", id, fallbackId: nanoid(6) });
  const buildSkillContent = (): string => {
    const frontmatter: Record<string, unknown> = {
      name: editName,
      description: editDescription,
    };
    if (editAllowedTools.trim()) {
      const tools = editAllowedTools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (tools.length) frontmatter.allowedTools = tools;
    }
    return `---\n${yaml.stringify(frontmatter, {
      lineWidth: 0,
    })}---\n\n${editContent}`;
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const skillContent = buildSkillContent();
      const env = Object.fromEntries(
        runtime.envRows.flatMap((r) => (r.key.trim().length > 0 ? [[r.key.trim(), r.value] as [string, string]] : [])),
      );
      const extension: SkillExtensionConfig = {
        version: 1,
        env,
        runtimePolicy: {
          python: runtime.pythonRuntime,
          node: runtime.nodeRuntime,
        },
        scriptOverrides: Object.fromEntries(
          runtime.scriptRows.map((s) => [
            s.relativePath,
            {
              enabled: s.enabled,
              description: s.description.trim() || undefined,
            },
          ]),
        ),
      };
      const result = await saveSkillWithExtension(skill.name, skillContent, extension);
      if (!result.success) {
        toast({
          title: "Save failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Saved successfully",
      });
      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: "Save failed",
        description: String(error),
        variant: "destructive",
      });
    }
    setSaving(false);
  };
  return (
    <div className="space-y-4 px-1">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={editName} disabled className="bg-muted" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="resize-none h-20"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Allowed Tools</Label>
        <Input
          value={editAllowedTools}
          onChange={(e) => setEditAllowedTools(e.target.value)}
          placeholder="Comma-separated tool names"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Content</Label>
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="min-h-48 resize-y font-mono text-xs"
        />
      </div>
      <Separator />
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Python Runtime</Label>
            <Select
              value={runtime.pythonRuntime}
              onValueChange={(v) => dispatchRuntime({ type: "SET_PYTHON_RUNTIME", value: v as SkillRuntimePreference })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="builtin">Built-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Node Runtime</Label>
            <Select
              value={runtime.nodeRuntime}
              onValueChange={(v) => dispatchRuntime({ type: "SET_NODE_RUNTIME", value: v as SkillRuntimePreference })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="builtin">Built-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Environment Variables</Label>
          <Button variant="ghost" size="sm" onClick={addEnvRow}>
            Add Variable
          </Button>
        </div>
        {runtime.envRows.map((row) => (
          <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
            <Input
              value={row.key}
              onChange={(e) => dispatchRuntime({ type: "UPDATE_ENV_ROW", id: row.id, key: e.target.value })}
              className="col-span-5"
              placeholder="Key"
            />
            <Input
              value={row.value}
              type="password"
              onChange={(e) => dispatchRuntime({ type: "UPDATE_ENV_ROW", id: row.id, value: e.target.value })}
              className="col-span-6"
              placeholder="Value"
            />
            <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeEnvRow(row.id)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Separator />
      {runtime.scriptRows.length > 0 && (
        <div className="space-y-3">
          {runtime.scriptRows.map((script) => (
            <div key={script.relativePath} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{script.relativePath}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[11px]">
                      {script.runtime}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{script.absolutePath}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-xs text-muted-foreground">Enabled</Label>
                  <Switch
                    checked={script.enabled}
                    onCheckedChange={(v) =>
                      dispatchRuntime({
                        type: "SET_SCRIPT_ENABLED",
                        relativePath: script.relativePath,
                        enabled: v,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Separator />
      <div className="space-y-1.5">
        <Label>Files</Label>
        <div className="border rounded-md p-2 bg-muted/30 max-h-48 overflow-auto">
          <SkillFolderTree skillName={skill.name} />
        </div>
      </div>
      <div className="sticky bottom-0 bg-background pt-4 border-t flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving || !runtime.loaded} onClick={handleSave}>
          {saving && <Icon icon="lucide:loader-2" className="w-4 h-4 mr-2 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
};
export default function SkillEditorSheet({ skill, open, onOpenChange, onSaved }: SkillEditorSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-screen flex-col overflow-hidden p-6 pt-12 sm:max-w-3xl lg:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Edit Skill</SheetTitle>
          <SheetDescription>{skill?.name}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="mt-4 min-h-0 flex-1">
          {skill && (
            <SkillEditorForm key={skill.name} skill={skill} onSaved={onSaved} onClose={() => onOpenChange(false)} />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
