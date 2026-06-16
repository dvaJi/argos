import { z } from "zod";

export const ConnectionStateSchema = z.object({
  mode: z.enum(["local", "remote"]),
  url: z.string().nullable(),
  connected: z.boolean(),
  lastError: z.string().nullable(),
});

export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const CONNECTION_STATE_DEFAULT: ConnectionState = {
  mode: "local",
  url: null,
  connected: false,
  lastError: null,
};
