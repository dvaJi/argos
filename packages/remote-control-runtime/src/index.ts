/**
 * @argos/remote-control-runtime — daemon-owned bot channel runtimes.
 *
 * Framework-agnostic port of the desktop `RemoteControlPresenter`. Runs the
 * Telegram / Discord / Feishu / QQ Bot / WeChat iLink bot adapters in any host
 * (the Bun daemon, or tests). Hosts inject `RemoteControlRuntimePorts`.
 *
 * Electron couplings from the original desktop presenter are removed:
 *  - `net.fetch` → `globalThis.fetch`
 *  - `app.getPath("userData")` → injected `dataDir` port
 *  - `BrowserWindow` (WeChat login) → host renders the returned `loginUrl`
 *  - `windowPresenter`/`tabPresenter` (`/open` command) → desktop-only UX hook
 */

export type {
  ConfigPort,
  RemoteConfigPort,
  RemoteProviderInfo,
  RemoteModelGroupInfo,
  RemoteAgentInfo,
  AgentSessionPort,
  GenerationPort,
  FilePort,
  RemoteControlRuntimePorts,
} from "./ports";
export { RemoteControlRuntime } from "./remoteControlRuntime";
