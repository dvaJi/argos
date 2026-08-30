import zod from "zod";
import { defineRouteContract } from "../common";

const terminalIdSchema = zod.string().min(1);
const colsSchema = zod.number().int().min(2).max(500);
const rowsSchema = zod.number().int().min(2).max(300);

export const TerminalExitStatusSchema = zod.object({
  exitCode: zod.number().int().nullable(),
  signal: zod.string().nullable(),
});

export type TerminalExitStatus = zod.infer<typeof TerminalExitStatusSchema>;

const TerminalSummarySchema = zod.object({
  terminalId: terminalIdSchema,
  shell: zod.string(),
  cwd: zod.string(),
  exitStatus: TerminalExitStatusSchema.nullable(),
});

export const terminalCreateRoute = defineRouteContract({
  name: "terminal.create",
  input: zod.object({
    /** Working directory for the shell (typically the workspace root). */
    cwd: zod.string().min(1),
    cols: colsSchema.default(80),
    rows: rowsSchema.default(24),
    /** Shell executable override; defaults to the platform shell. */
    shell: zod.string().min(1).optional(),
  }),
  output: zod.object({
    terminalId: terminalIdSchema,
    shell: zod.string(),
    cwd: zod.string(),
    cols: colsSchema,
    rows: rowsSchema,
  }),
});

export const terminalInputRoute = defineRouteContract({
  name: "terminal.input",
  input: zod.object({
    terminalId: terminalIdSchema,
    data: zod.string(),
  }),
  output: zod.object({}),
});

export const terminalResizeRoute = defineRouteContract({
  name: "terminal.resize",
  input: zod.object({
    terminalId: terminalIdSchema,
    cols: colsSchema,
    rows: rowsSchema,
  }),
  output: zod.object({}),
});

export const terminalKillRoute = defineRouteContract({
  name: "terminal.kill",
  input: zod.object({
    terminalId: terminalIdSchema,
  }),
  output: zod.object({}),
});

export const terminalListRoute = defineRouteContract({
  name: "terminal.list",
  input: zod.object({}),
  output: zod.object({
    terminals: zod.array(TerminalSummarySchema),
  }),
});

/**
 * Replay a terminal's scrollback before/alongside live `terminal.output`
 * events. `seq` is the latest output sequence number contained in `buffer`;
 * clients drop buffered live events with `seq <= attach.seq` to avoid
 * duplicates.
 */
export const terminalAttachRoute = defineRouteContract({
  name: "terminal.attach",
  input: zod.object({
    terminalId: terminalIdSchema,
  }),
  output: zod.object({
    terminalId: terminalIdSchema,
    /** Base64-encoded scrollback bytes. */
    buffer: zod.string(),
    seq: zod.number().int().min(0),
    exitStatus: TerminalExitStatusSchema.nullable(),
  }),
});
