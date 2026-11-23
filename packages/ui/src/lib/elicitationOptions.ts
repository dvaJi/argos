/**
 * Choice lists from an elicitation's requested-schema property (MCP / ACP
 * `elicitation/create`). Supports the spec's enum shapes:
 * - single choice: `enum` (with legacy `enumNames` labels) or titled
 *   `oneOf`/`anyOf` entries of `{ const, title }`
 * - multiple choice: `type: "array"` whose `items` use either shape
 * Answers must use the option `value`; servers reject anything else.
 */
export type ElicitationOption = { value: string; label: string };

type ConstEntry = { const?: unknown; title?: unknown };
type EnumShape = {
  type?: string;
  enum?: unknown;
  enumNames?: unknown;
  oneOf?: unknown;
  anyOf?: unknown;
};
export type ElicitationChoiceProperty = EnumShape & { items?: EnumShape };

function optionsFrom(shape: EnumShape | undefined): ElicitationOption[] | null {
  if (!shape) return null;
  if (Array.isArray(shape.enum)) {
    const names = Array.isArray(shape.enumNames) ? shape.enumNames : [];
    return shape.enum.map((value, index) => ({
      value: String(value),
      label: typeof names[index] === "string" ? names[index] : String(value),
    }));
  }
  const entries = (Array.isArray(shape.oneOf) ? shape.oneOf : Array.isArray(shape.anyOf) ? shape.anyOf : null) as
    | ConstEntry[]
    | null;
  if (!entries) return null;
  const options = entries
    .filter((entry) => entry && entry.const !== undefined)
    .map((entry) => ({
      value: String(entry.const),
      label: typeof entry.title === "string" && entry.title ? entry.title : String(entry.const),
    }));
  return options.length > 0 ? options : null;
}

/** Options for a single-choice string field, or null when it is free text. */
export function singleChoiceOptions(prop: ElicitationChoiceProperty): ElicitationOption[] | null {
  return prop.type === "array" ? null : optionsFrom(prop);
}

/** Options for a multi-choice array field, or null when items are free text. */
export function multiChoiceOptions(prop: ElicitationChoiceProperty): ElicitationOption[] | null {
  return prop.type === "array" ? optionsFrom(prop.items) : null;
}
