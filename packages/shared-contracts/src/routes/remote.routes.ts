import zod from "zod";
import { defineRouteContract } from "../common";

/**
 * Remote-control channel routes (config surface).
 *
 * These routes expose daemon-owned bot-channel configuration, pairing, status,
 * bindings, and login flows to both desktop and web clients. Incoming messages
 * are handled directly by the daemon runtime and do not cross this API.
 *
 * Schemas are intentionally permissive (`zod.unknown()` / `passthrough`) for the
 * nested channel settings/status shapes; the canonical validation lives in
 * `@argos/remote-control-runtime` (`normalizeRemoteControlConfig` etc.).
 */

const RemoteChannelSchema = zod.enum(["telegram", "feishu", "qqbot", "discord", "weixin-ilink"]);

const PairableRemoteChannelSchema = zod.enum(["telegram", "feishu", "qqbot", "discord"]);

export const remoteListChannelsRoute = defineRouteContract({
  name: "remote.listChannels",
  input: zod.object({}).default({}),
  output: zod.object({
    channels: zod.array(zod.unknown()),
  }),
});

export const remoteGetChannelSettingsRoute = defineRouteContract({
  name: "remote.getChannelSettings",
  input: zod.object({ channel: RemoteChannelSchema }),
  output: zod.object({ settings: zod.unknown() }),
});

export const remoteSaveChannelSettingsRoute = defineRouteContract({
  name: "remote.saveChannelSettings",
  input: zod.object({ channel: RemoteChannelSchema, settings: zod.unknown() }),
  output: zod.object({ settings: zod.unknown() }),
});

export const remoteGetChannelStatusRoute = defineRouteContract({
  name: "remote.getChannelStatus",
  input: zod.object({ channel: RemoteChannelSchema }),
  output: zod.object({ status: zod.unknown() }),
});

export const remoteGetChannelBindingsRoute = defineRouteContract({
  name: "remote.getChannelBindings",
  input: zod.object({ channel: RemoteChannelSchema }),
  output: zod.object({ bindings: zod.array(zod.unknown()) }),
});

export const remoteRemoveChannelBindingRoute = defineRouteContract({
  name: "remote.removeChannelBinding",
  input: zod.object({ channel: RemoteChannelSchema, endpointKey: zod.string() }),
  output: zod.object({}).default({}),
});

export const remoteRemoveChannelPrincipalRoute = defineRouteContract({
  name: "remote.removeChannelPrincipal",
  input: zod.object({ channel: PairableRemoteChannelSchema, principalId: zod.string() }),
  output: zod.object({}).default({}),
});

export const remoteGetChannelPairingRoute = defineRouteContract({
  name: "remote.getChannelPairing",
  input: zod.object({ channel: PairableRemoteChannelSchema }),
  output: zod.object({ snapshot: zod.unknown() }),
});

export const remoteCreatePairCodeRoute = defineRouteContract({
  name: "remote.createPairCode",
  input: zod.object({ channel: PairableRemoteChannelSchema }),
  output: zod.object({ code: zod.string(), expiresAt: zod.number() }),
});

export const remoteClearPairCodeRoute = defineRouteContract({
  name: "remote.clearPairCode",
  input: zod.object({ channel: PairableRemoteChannelSchema }),
  output: zod.object({}).default({}),
});

export const remoteClearBindingsRoute = defineRouteContract({
  name: "remote.clearBindings",
  input: zod.object({ channel: RemoteChannelSchema }),
  output: zod.object({ count: zod.number() }),
});

export const remoteWeixinStartLoginRoute = defineRouteContract({
  name: "remote.weixin.startLogin",
  input: zod.object({ force: zod.boolean().optional() }).default({}),
  output: zod.object({
    sessionKey: zod.string(),
    loginUrl: zod.string().nullable(),
    message: zod.string().optional(),
    messageKey: zod.string().optional(),
  }),
});

export const remoteWeixinWaitForLoginRoute = defineRouteContract({
  name: "remote.weixin.waitForLogin",
  input: zod.object({ sessionKey: zod.string(), timeoutMs: zod.number().optional() }),
  output: zod.object({
    connected: zod.boolean(),
    account: zod.unknown().nullable(),
    message: zod.string().optional(),
    messageKey: zod.string().optional(),
  }),
});

export const remoteWeixinRemoveAccountRoute = defineRouteContract({
  name: "remote.weixin.removeAccount",
  input: zod.object({ accountId: zod.string() }),
  output: zod.object({}).default({}),
});

export const remoteWeixinRestartAccountRoute = defineRouteContract({
  name: "remote.weixin.restartAccount",
  input: zod.object({ accountId: zod.string() }),
  output: zod.object({}).default({}),
});
