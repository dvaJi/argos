import zod from "zod";

export const RECONNECT_EXHAUSTED_ERROR = "Automatic reconnection stopped after repeated failures";

export const ConnectionStateSchema = zod.object({
  mode: zod.enum(["local", "remote"]),
  url: zod.string().nullable(),
  connected: zod.boolean(),
  lastError: zod.string().nullable(),
  reconnectAttempt: zod.number().int().nonnegative().optional(),
  maxReconnectAttempts: zod.number().int().positive().optional(),
  workspaceId: zod.string().optional(),
});

export type ConnectionState = zod.infer<typeof ConnectionStateSchema>;

export const CONNECTION_STATE_DEFAULT: ConnectionState = {
  mode: "local",
  url: null,
  connected: false,
  lastError: null,
  reconnectAttempt: 0,
  maxReconnectAttempts: 10,
  workspaceId: undefined,
};
