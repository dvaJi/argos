# Tasks — Remove Feishu

- [ ] Delete `plugins/feishu/`
- [ ] Strip feishu `plugin:bundle` from root `package.json` build scripts
- [ ] Remove feishu plugin bundling from CI workflows
- [ ] Drop `feishu` from `RemoteChannelSchema` / `PairableRemoteChannelSchema`
- [ ] Drop `feishu` keyword in `settingsNavigation.ts`
- [ ] Remove Feishu types from `remote-control.presenter.d.ts`
- [ ] Drop Feishu from `client-sdk` remote-control-client signatures
- [ ] Delete runtime `feishu/` + `adapters/feishu/` + `services/feishu{AuthGuard,CommandRouter}.ts`
- [ ] Relocate `buildFeishuPendingInteractionText` → neutral helper; update discord/qqbot importers
- [ ] Surgically remove `feishu` from `remoteControlRuntime.ts`, `remoteBindingStore.ts`, `types.ts`, `index.ts`
- [ ] Remove `getFeishu` whitelist in desktop `presenter/index.ts`
- [ ] Remove Feishu from UI (RemoteSettings, spotlight, webBridge)
- [ ] Delete + fix feishu-referencing tests
- [ ] Delete `docs/issues/feishu-pairing-save-race/`; strip feishu from other docs
- [ ] Verify: typecheck / format / lint / tests
