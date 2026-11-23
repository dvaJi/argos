import { type FC, useEffect, useRef, useState } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

interface ResourceTemplateCompletionsProps {
  serverName: string;
  uriTemplate: string;
  disabled?: boolean;
}

/**
 * Per-placeholder argument inputs for a resource template
 * (`ref/resource` completions against the template URI): placeholders are parsed from the
 * RFC 6570-style URI template, each input fetches debounced server-side
 * completions while typing, and the composed URI preview shows the values
 * substituted in.
 */
export const ResourceTemplateCompletions: FC<ResourceTemplateCompletionsProps> = ({
  serverName,
  uriTemplate,
  disabled,
}) => {
  const placeholders = parsePlaceholders(uriTemplate);
  const [values, setValues] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const debounceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [debounceTimers]);

  if (placeholders.length === 0) return null;

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const fetchCompletions = (argName: string, currentValue: string) => {
    const timerKey = `${uriTemplate}:${argName}`;
    const existing = debounceTimers.current.get(timerKey);
    if (existing) clearTimeout(existing);
    debounceTimers.current.set(
      timerKey,
      setTimeout(async () => {
        debounceTimers.current.delete(timerKey);
        try {
          const result = await mcpClient.completeArgument(serverName, {
            ref: { type: "ref/resource", uri: uriTemplate },
            argument: { name: argName, value: currentValue },
          });
          const completion = (result as { completion?: { values?: string[] } })?.completion;
          const suggestionValues = completion?.values;
          if (Array.isArray(suggestionValues) && suggestionValues.length > 0) {
            setSuggestions((prev) => ({ ...prev, [argName]: suggestionValues }));
          }
        } catch {
          // Completions are optional; servers without the capability just don't provide them
        }
      }, 300),
    );
  };

  const composedUri = expandTemplate(uriTemplate, values);

  return (
    <div className="mt-2 space-y-2">
      {placeholders.map((key) => {
        const fieldId = `rt-completion-${uriTemplate}-${key}`;
        const keySuggestions = suggestions[key] ?? [];
        return (
          <div key={key} className="space-y-1 relative">
            <Label htmlFor={fieldId} className="text-[11px] text-muted-foreground">
              {key}
            </Label>
            <Input
              id={fieldId}
              disabled={disabled}
              value={values[key] ?? ""}
              onChange={(e) => {
                setValue(key, e.target.value);
                fetchCompletions(key, e.target.value);
              }}
              onFocus={() => fetchCompletions(key, values[key] ?? "")}
              className="h-7 text-xs"
              placeholder={`Value for {${key}}`}
              autoComplete="off"
            />
            {keySuggestions.length > 0 && (
              <div className="absolute z-20 w-full rounded-md border bg-popover shadow-md mt-1 max-h-32 overflow-y-auto">
                {keySuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setValue(key, suggestion);
                      setSuggestions((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <code
        className="block rounded bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground break-all"
        title={composedUri}
      >
        {composedUri}
      </code>
    </div>
  );
};

const EXPRESSION = /\{([+#./;?&]?)([^}]*)\}/g;

/** Splits an expression body (`a,b:3,c*`) into bare variable names. */
function expressionVariables(body: string): string[] {
  return body
    .split(",")
    .map((spec) => spec.trim().replace(/\*$/, "").replace(/:\d+$/, ""))
    .filter(Boolean);
}

/**
 * Extracts variable names from an RFC 6570 URI template, stripping operators
 * (`{+path}`, `{?q,page}`, `{/segments*}`) and modifiers, so completion
 * requests use the argument names the server declared.
 */
function parsePlaceholders(uriTemplate: string): string[] {
  const names: string[] = [];
  for (const match of uriTemplate.matchAll(EXPRESSION)) {
    for (const name of expressionVariables(match[2])) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Previews the URI with the entered values (RFC 6570 level 3 operators).
 * Expressions without any filled value are left as-is.
 */
function expandTemplate(uriTemplate: string, values: Record<string, string>): string {
  return uriTemplate.replace(EXPRESSION, (expression, operator: string, body: string) => {
    const filled = expressionVariables(body)
      .map((name) => [name, values[name]?.trim() ?? ""] as const)
      .filter(([, value]) => value.length > 0);
    if (filled.length === 0) return expression;
    const reserved = operator === "+" || operator === "#";
    const encode = (value: string) => (reserved ? encodeURI(value) : encodeURIComponent(value));
    switch (operator) {
      case "?":
      case "&":
        return operator + filled.map(([name, value]) => `${name}=${encode(value)}`).join("&");
      case ";":
        return filled.map(([name, value]) => `;${name}=${encode(value)}`).join("");
      case ".":
      case "/":
        return operator + filled.map(([, value]) => encode(value)).join(operator);
      case "#":
        return "#" + filled.map(([, value]) => encode(value)).join(",");
      default:
        return filled.map(([, value]) => encode(value)).join(",");
    }
  });
}
