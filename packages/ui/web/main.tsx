/**
 * Browser bootstrap — constructs window.argos from WebSocketBridge
 * and installs a window.api shim using Web APIs.
 *
 * This entry runs when the Argos UI is served by the daemon (--web).
 * The daemon serving the page is the daemon to connect to.
 *
 * Pairing flow:
 * 1. If URL has ?token=xxx, POST to /api/v1/pair to exchange for a session cookie.
 * 2. If session cookie exists (or loopback), connect via WebSocket.
 * 3. If neither, show pairing instructions.
 */

import "../src/assets/main.css";
import "katex/dist/katex.min.css";
import { WebSocketBridge } from "@argos/client-sdk";
import { browserLocalApi } from "#api/local-api";
import { exchangeBrowserPairingToken, stripPairingToken } from "./browserPairing";

declare global {
  interface Window {
    argos?: any;
    api?: any;
    electron?: any;
    __argosRuntimeKind?: string;
  }
}

window.__argosRuntimeKind = "browser";

window.api = browserLocalApi;
window.electron = undefined;

const root = document.getElementById("root");

function renderPage(_title: string, message: string, color = "#888"): void {
  if (root) {
    root.innerHTML = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
        <h1>Argos</h1>
        <p style="color: ${color};">${message}</p>
      </div>
    `;
  }
}

function stripTokenParam(): void {
  window.history.replaceState({}, document.title, stripPairingToken(window.location.href));
}

async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const pairToken = params.get("token");

  if (pairToken) {
    renderPage("Argos", "Exchanging pairing token...");
    stripTokenParam();
    const result = await exchangeBrowserPairingToken(pairToken);
    if (!result.ok) {
      renderPage("Argos", "Pairing failed. The token may be invalid, expired, or already used.", "#e00");
      return;
    }
  }

  const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/v1/events`;
  const bridge = new WebSocketBridge(wsUrl);

  let connected = false;
  const stateListeners = new Set<
    (state: { connected: boolean; url: string | null; lastError: string | null }) => void
  >();

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
      list: () => [{ id: "local", name: "This computer", mode: "local", remoteUrl: "", createdAt: 0 }],
      getActive: () => ({ id: "local", name: "This computer", mode: "local", remoteUrl: "", createdAt: 0 }),
      switchTo: async () => {},
      add: () => ({ id: "local", name: "This computer", mode: "local", remoteUrl: "", createdAt: 0 }),
      remove: () => {},
      rename: () => {},
    },
  };

  renderPage("Argos", "Connecting to daemon...");

  try {
    await bridge.connect();
    const environment = await bridge.invoke("connection.describeEnvironment", {
      protocolVersion: 1,
      runtimeKind: "browser",
    });
    if (!environment.compatible || !environment.capabilities.includes("browser")) {
      bridge.close();
      renderPage(
        "Argos",
        "This Argos Server does not support the browser runtime. Update the server and try again.",
        "#e00",
      );
      return;
    }
    connected = true;
    renderPage("Argos", "Connected. Full UI loading...");
    stateListeners.forEach((fn) => fn({ connected, url: window.location.origin, lastError: null }));
    if (root) {
      root.innerHTML = '<div id="app"></div>';
    }
    await import("../src/main");
  } catch (err) {
    const msg = err instanceof Error ? err.message : err instanceof Event ? `${err.type} event` : String(err);
    renderPage("Argos", `Connection failed: ${msg}`, "#e00");
  }
}

bootstrap();
