# Spec — Remove Feishu

Remove the Feishu remote-control integration end to end (plugin bundle, runtime
package code, shared types, route schemas, UI, desktop bridge, client-sdk,
tests, docs, and CI references). Scope confirmed with user: **Everything**.

## Why

Feishu is one of several remote-control channels (telegram / feishu / qqbot /
discord / weixin-ilink). It is being dropped from the product. The remaining
channels (telegram, qqbot, discord, weixin-ilink) must keep working.

## Constraints / gotchas

- `feishuInteractionPrompt.ts` exports `buildFeishuPendingInteractionText`, which
  is **shared** by discord / qqbot (discordRuntime, qqbotRuntime,
  discordCommandRouter, qqbotCommandRouter). Do NOT delete it outright — relocate
  the helper to a neutral module (`services/pendingInteractionPrompt.ts` as
  `buildPendingInteractionText`) and update the 4 importers.
- `remote-control.presenter.d.ts` is a hand-maintained declaration file (no
  generated `.ts`); edit it directly and drop Feishu from channel unions.
- `RemoteChannelSchema` / `PairableRemoteChannelSchema` in `remote.routes.ts`
  drive the route-catalog guard — keep them valid after removing `feishu`.
- Keep `telegram`, `qqbot`, `discord`, `weixin-ilink` intact.
