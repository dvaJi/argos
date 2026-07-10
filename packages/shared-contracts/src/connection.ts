import zod from "zod";

export const ConnectionStateSchema = zod.object({
  mode: zod.enum(["local", "remote"]),
  url: zod.string().nullable(),
  connected: zod.boolean(),
  lastError: zod.string().nullable(),
  workspaceId: zod.string().optional(),
});

export type ConnectionState = zod.infer<typeof ConnectionStateSchema>;

export const CONNECTION_STATE_DEFAULT: ConnectionState = {
  mode: "local",
  url: null,
  connected: false,
  lastError: null,
  workspaceId: undefined,
};
