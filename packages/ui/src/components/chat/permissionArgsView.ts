/**
 * Turns a permission request's raw JSON arguments into something a person can
 * judge: the shell command itself, the file being written and its content, or
 * the edits, instead of one JSON string full of escaped newlines.
 */
export type PermissionArgsSection = {
  label: string;
  /** Rendered as a scrollable code block when set. */
  code?: string;
  /** Rendered as plain text when set. */
  text?: string;
};

export type PermissionArgsView = {
  /** Short one-line summary, e.g. "Write src/server/mod.rs (84 lines)". */
  summary?: string;
  sections: PermissionArgsSection[];
};

function lineCount(value: string): number {
  return value ? value.split("\n").length : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function describePermissionArgs(toolName: string, rawArgs: string): PermissionArgsView {
  const raw = rawArgs.trim();
  if (!raw) return { sections: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { sections: [{ label: "Arguments", code: raw }] };
  }
  const args = asRecord(parsed);
  const name = toolName.toLowerCase();

  if (args && (name === "bash" || name === "powershell")) {
    const command = str(args.command);
    if (command !== undefined) {
      const sections: PermissionArgsSection[] = [{ label: "Command", code: command }];
      const timeout = args.timeout;
      if (typeof timeout === "number") sections.push({ label: "Timeout", text: `${timeout}s` });
      const lines = lineCount(command);
      return { summary: lines > 1 ? `Run a ${lines}-line command` : "Run a command", sections };
    }
  }

  if (args && name === "write") {
    const path = str(args.path) ?? str(args.file_path);
    const content = str(args.content);
    if (path && content !== undefined) {
      return {
        summary: `Write ${path} (${lineCount(content)} ${lineCount(content) === 1 ? "line" : "lines"})`,
        sections: [{ label: "Content", code: content }],
      };
    }
  }

  if (args && name === "edit") {
    const path = str(args.path) ?? str(args.file_path);
    const edits = Array.isArray(args.edits)
      ? args.edits.map(asRecord).filter((edit): edit is Record<string, unknown> => edit !== null)
      : [args];
    const sections = edits.flatMap((edit, index) => {
      const oldText = str(edit.oldText) ?? str(edit.old_string);
      const newText = str(edit.newText) ?? str(edit.new_string);
      if (oldText === undefined || newText === undefined) return [];
      const suffix = edits.length > 1 ? ` ${index + 1}` : "";
      return [
        { label: `Replace${suffix}`, code: oldText },
        { label: `With${suffix}`, code: newText },
      ];
    });
    if (path && sections.length > 0) {
      return {
        summary: `Edit ${path} (${sections.length / 2} ${sections.length === 2 ? "change" : "changes"})`,
        sections,
      };
    }
  }

  return { sections: [{ label: "Arguments", code: JSON.stringify(parsed, null, 2) }] };
}
