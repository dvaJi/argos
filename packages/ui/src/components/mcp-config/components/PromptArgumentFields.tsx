import { type FC, useEffect, useRef, useState } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

interface PromptArgumentFieldDef {
  name: string;
  description: string;
  required: boolean;
}

interface PromptArgumentFieldProps {
  serverName: string;
  promptName: string;
  args: PromptArgumentFieldDef[];
  disabled: boolean;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
}

/**
 * Renders individual argument input fields for a prompt with server-provided
 * completions (`completion/complete`). Suggestions are fetched debounced as
 * the user types and shown in a dropdown below each field.
 */
export const PromptArgumentFields: FC<PromptArgumentFieldProps> = ({
  serverName,
  promptName,
  args,
  disabled,
  values,
  onValuesChange,
}) => {
  const [openSuggestions, setOpenSuggestions] = useState<Record<string, string[]>>({});
  const debounceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [debounceTimers]);

  const setValue = (key: string, value: string) => {
    onValuesChange({ ...values, [key]: value });
  };

  const fetchCompletions = (argName: string, currentValue: string) => {
    const timerKey = `${promptName}:${argName}`;
    const existing = debounceTimers.current.get(timerKey);
    if (existing) clearTimeout(existing);
    debounceTimers.current.set(
      timerKey,
      setTimeout(async () => {
        debounceTimers.current.delete(timerKey);
        try {
          const result = await mcpClient.completeArgument(serverName, {
            ref: { type: "ref/prompt", name: promptName },
            argument: { name: argName, value: currentValue },
          });
          const completion = (result as { completion?: { values?: string[] } })?.completion;
          const suggestionValues = completion?.values;
          if (Array.isArray(suggestionValues) && suggestionValues.length > 0) {
            setOpenSuggestions((prev) => ({ ...prev, [argName]: suggestionValues }));
          }
        } catch {
          // Completions are optional; servers without the capability just don't provide them
        }
      }, 300),
    );
  };

  return (
    <div className="space-y-3">
      {args.map((arg) => {
        const fieldId = `prompt-arg-${promptName}-${arg.name}`;
        const suggestions = openSuggestions[arg.name] ?? [];
        return (
          <div key={arg.name} className="space-y-1.5 relative">
            <Label htmlFor={fieldId} className="text-xs">
              {arg.name}
              {arg.required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <Input
              id={fieldId}
              disabled={disabled}
              value={values[arg.name] ?? ""}
              onChange={(e) => {
                setValue(arg.name, e.target.value);
                fetchCompletions(arg.name, e.target.value);
              }}
              onFocus={() => fetchCompletions(arg.name, values[arg.name] ?? "")}
              className="h-8 text-xs"
              placeholder={arg.description || `Enter ${arg.name}`}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-20 w-full rounded-md border bg-popover shadow-md mt-1 max-h-40 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setValue(arg.name, suggestion);
                      setOpenSuggestions((prev) => {
                        const next = { ...prev };
                        delete next[arg.name];
                        return next;
                      });
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {arg.description && suggestions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">{arg.description}</p>
            )}
          </div>
        );
      })}
      {args.some((a) => a.required) && (
        <p className="text-[11px] text-muted-foreground">
          <span className="text-destructive">*</span> Required
        </p>
      )}
    </div>
  );
};
