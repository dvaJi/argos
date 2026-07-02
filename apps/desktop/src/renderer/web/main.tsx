/**
 * Browser bootstrap — constructs window.argos from WebSocketBridge
 * and installs a window.api shim using Web APIs.
 *
 * This entry runs when the Argos UI is served by the daemon (--web).
 * The daemon serving the page is the daemon to connect to.
 */

import { WebSocketBridge } from "@argos/client-sdk";

declare global {
  interface Window {
    argos?: any;
    api?: any;
    electron?: any;
    __argosRuntimeKind?: string;
  }
}

const runtimeKind = "browser";
window.__argosRuntimeKind = runtimeKind;

const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/v1/events`;
const bridge = new WebSocketBridge(wsUrl);

let connected = false;
const stateListeners = new Set<(state: { connected: boolean; url: string | null; lastError: string | null }) => void>();

window.argos = {
  invoke: bridge.invoke.bind(bridge),
  on: bridge.on.bind(bridge),
  connection: {
    getState: () => ({ mode: "local" as const, url: window.location.origin, connected, lastError: null }),
    onStateChange: (listener: (state: any) => void) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  },
  workspace: {
    list: () => [{ id: "local", name: "Local", mode: "local", remoteUrl: "", createdAt: 0 }],
    getActive: () => ({ id: "local", name: "Local", mode: "local", remoteUrl: "", createdAt: 0 }),
    switchTo: async () => {},
    add: () => ({ id: "local", name: "Local", mode: "local", remoteUrl: "", createdAt: 0 }),
    remove: () => {},
    rename: () => {},
  },
};

window.api = {
  copyText: (text: string) => navigator.clipboard?.writeText(text).catch(() => {}),
  copyImage: () => {},
  readClipboardText: () => navigator.clipboard?.readText() ?? Promise.resolve(""),
  getPathForFile: () => "",
  getWindowId: () => null,
  getWebContentsId: () => 0,
  getArch: () => "browser",
  openExternal: (url: string) => {
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  },
  toRelativePath: (filePath: string) => filePath,
  formatPathForInput: (filePath: string) => filePath,
};

window.electron = undefined;

const root = document.getElementById("root");
if (root) {
  root.innerHTML = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
      <h1>Argos</h1>
      <p id="status" style="color: #888;">Connecting to daemon...</p>
    </div>
  `;
  const statusEl = document.getElementById("status");
  bridge
    .connect()
    .then(() => {
      connected = true;
      if (statusEl) statusEl.textContent = "Connected. Full UI loading...";
      stateListeners.forEach((fn) => fn({ connected, url: window.location.origin, lastError: null }));
    })
    .catch((err) => {
      if (statusEl) statusEl.textContent = `Connection failed: ${err.message}`;
    });
}
