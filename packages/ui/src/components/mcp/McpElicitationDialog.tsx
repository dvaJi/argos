import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { Icon } from "@iconify/react";
import {
  type ElicitationPropertyView,
  mcpElicitationStore,
  requiredFields,
  setValue,
  schemaProperties,
  submitDecision,
  useMcpElicitationStore,
  useInitMcpElicitation,
} from "#/stores/mcpElicitation";

/**
 * Renders pending MCP server elicitations (`elicitation/create`) as a dialog:
 * the server's message plus one input per requested-schema property.
 */
export default function McpElicitationDialog() {
  useInitMcpElicitation();
  const state = useMcpElicitationStore();
  const request = state.request;
  if (!request) return null;

  const properties = schemaProperties(request);
  const required = requiredFields(request);
  const serverName = request.serverName;

  const renderField = (key: string, prop: ElicitationPropertyView) => {
    const label = prop.title?.trim() || key;
    const fieldId = `mcp-elicitation-field-${key}`;
    const value = state.values[key] ?? "";
    if (prop.type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={fieldId}
            checked={value === "true"}
            onCheckedChange={(checked) => setValue(key, checked === true ? "true" : "false")}
          />
          <Label htmlFor={fieldId} className="text-xs">
            {label}
          </Label>
        </div>
      );
    }
    const inputType = prop.type === "number" || prop.type === "integer" ? "number" : "text";
    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={fieldId} className="text-xs">
          {label}
          {required.has(key) && <span className="ml-1 text-muted-foreground">*</span>}
        </Label>
        <Input
          id={fieldId}
          type={inputType}
          value={value}
          onChange={(event) => setValue(key, event.target.value)}
          className="h-8 text-xs"
          placeholder={prop.type === "array" ? "Comma-separated values" : undefined}
        />
        {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover p-5 shadow-lg"
        data-testid="mcp-elicitation-dialog"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon icon="lucide:text-cursor-input" className="h-4 w-4" />
          <span>{serverName} needs your input</span>
        </div>

        {request.message && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{request.message}</p>}

        <div className="mt-4 space-y-3">{Object.entries(properties).map(([key, prop]) => renderField(key, prop))}</div>

        {state.error && <p className="mt-3 text-[11px] text-destructive">{state.error}</p>}

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => void submitDecision("cancel")}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => void submitDecision("decline")}
          >
            Decline
          </Button>
          <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => void submitDecision("accept")}>
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
