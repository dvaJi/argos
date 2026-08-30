import zod from "zod";
import { defineEventContract } from "../common";

/**
 * Coalesced PTY output chunk for a terminal session. `data` is
 * base64-encoded raw terminal bytes (VT sequences included); `seq` is a
 * per-terminal monotonic counter used by clients to de-duplicate replayed
 * scrollback against live events.
 */
export const terminalOutputEvent = defineEventContract({
  name: "terminal.output",
  payload: zod.object({
    terminalId: zod.string().min(1),
    seq: zod.number().int().min(0),
    data: zod.string(),
  }),
});

export const terminalExitEvent = defineEventContract({
  name: "terminal.exit",
  payload: zod.object({
    terminalId: zod.string().min(1),
    exitCode: zod.number().int().nullable(),
    signal: zod.string().nullable(),
  }),
});
