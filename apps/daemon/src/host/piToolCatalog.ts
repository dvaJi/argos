import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";

type CatalogEntry = {
  description: string;
  properties: Record<string, { type: string; items?: { type: string; description?: string }; description: string }>;
  required?: string[];
};

const PI_TOOL_CATALOG: Record<string, CatalogEntry> = {
  read: {
    description:
      "Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Images are sent as attachments. Text output is truncated to 2000 lines or 50KB; use offset/limit for large files.",
    properties: {
      path: { type: "string", description: "Path to the file to read." },
      offset: { type: "number", description: "Offset into the file (in lines) to start reading from." },
      limit: { type: "number", description: "Maximum number of lines to read." },
    },
    required: ["path"],
  },
  bash: {
    description:
      "Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to the last 2000 lines or 50KB; optionally provide a timeout in seconds.",
    properties: {
      command: { type: "string", description: "The bash command to execute." },
      timeout: { type: "number", description: "Optional timeout in seconds." },
    },
    required: ["command"],
  },
  edit: {
    description:
      "Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the file. Merge overlapping changes into one edit.",
    properties: {
      path: { type: "string", description: "Path of the file to edit." },
      edits: {
        type: "array",
        items: { type: "object", description: "A single replacement: oldText to find and newText to replace it with." },
        description: "The edits to apply.",
      },
    },
    required: ["path", "edits"],
  },
  write: {
    description:
      "Write content to a file, creating it if it doesn't exist and overwriting if it does. Automatically creates parent directories.",
    properties: {
      path: { type: "string", description: "Path of the file to write." },
      content: { type: "string", description: "Full content to write to the file." },
    },
    required: ["path", "content"],
  },
  grep: {
    description:
      "Search file contents for a pattern, returning matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to 100 matches or 50KB.",
    properties: {
      pattern: { type: "string", description: "Pattern to search for." },
      path: { type: "string", description: "File or directory to search." },
      glob: { type: "string", description: "Optional glob to filter files." },
      ignoreCase: { type: "boolean", description: "Whether to ignore case." },
      literal: { type: "boolean", description: "Match literally rather than as a regex." },
      context: { type: "number", description: "Lines of context to include around matches." },
      limit: { type: "number", description: "Maximum number of matches." },
    },
    required: ["pattern", "path"],
  },
  find: {
    description:
      "Search for files by glob pattern, returning paths relative to the search directory. Respects .gitignore. Output is truncated to 1000 results or 50KB.",
    properties: {
      pattern: { type: "string", description: "Glob pattern to match." },
      path: { type: "string", description: "Directory to search." },
      limit: { type: "number", description: "Maximum number of results." },
    },
    required: ["pattern", "path"],
  },
  ls: {
    description:
      "List directory contents, sorted alphabetically with a '/' suffix for directories. Includes dotfiles. Output is truncated to 500 entries or 50KB.",
    properties: {
      path: { type: "string", description: "Directory to list." },
      limit: { type: "number", description: "Maximum number of entries." },
    },
    required: ["path"],
  },
};

const PI_SERVER = {
  name: "pi",
  icons: "",
  description: "Pi coding-agent built-in tools",
} as const;

export function getPiToolDefinitions(): MCPToolDefinition[] {
  return Object.entries(PI_TOOL_CATALOG).map(([name, entry]) => ({
    type: "function",
    source: "agent",
    function: {
      name,
      description: entry.description,
      parameters: {
        type: "object",
        properties: entry.properties,
        required: entry.required,
      },
    },
    server: { ...PI_SERVER },
  }));
}
