import { session } from "electron";
import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { eventBus } from "@/eventbus";
import { CONFIG_EVENTS } from "@/events";

// Keep it simple for now: use the system proxy
export enum ProxyMode {
  SYSTEM = "system",
  NONE = "none",
  CUSTOM = "custom",
}
export const NO_PROXY = "localhost, 127.0.0.1, ::1, 192.168.*.*, 10.*.*.*, *.local, host.docker.internal";
// const NO_PROXY = ''

// Merge system and custom no_proxy settings
function mergeNoProxy(defaultNoProxy: string): string {
  const systemNoProxy = process.env.no_proxy || process.env.NO_PROXY || "";
  console.log("systemNoProxy", systemNoProxy);
  if (!systemNoProxy) {
    return defaultNoProxy;
  }
  // Split both no_proxy strings into arrays, deduplicate, then recombine
  const noProxySet = new Set(
    [
      ...defaultNoProxy.split(",").map((item) => item.trim()),
      ...systemNoProxy.split(",").map((item) => item.trim()),
    ].filter(Boolean),
  ); // Filter out empty strings

  return Array.from(noProxySet).join(", ");
}

export class ProxyConfig {
  private proxyUrl: string | null = null;
  private mode: ProxyMode = ProxyMode.SYSTEM;
  private customProxyUrl: string = "";

  constructor() {
    this.mode = ProxyMode.SYSTEM;

    // Listen for proxy mode change events
    eventBus.on(CONFIG_EVENTS.PROXY_MODE_CHANGED, (mode: string) => {
      this.setProxyMode(mode as ProxyMode);
      this.resolveProxy();
    });

    // Listen for custom proxy URL change events
    eventBus.on(CONFIG_EVENTS.CUSTOM_PROXY_URL_CHANGED, (url: string) => {
      this.setCustomProxyUrl(url);
      if (this.mode === ProxyMode.CUSTOM) {
        this.resolveProxy();
      }
    });
  }

  async resolveProxy(): Promise<void> {
    try {
      // Configure based on the proxy mode
      if (this.mode === ProxyMode.NONE) {
        this.clearProxy();
        console.log("clear proxy");
        return;
      } else if (this.mode === ProxyMode.CUSTOM && this.customProxyUrl) {
        console.log("proxy url", this.customProxyUrl);
        this.setCustomProxy(this.customProxyUrl);
        return;
      }

      // System proxy mode
      session.defaultSession.setProxy({ mode: "system" });
      const proxyString = await session.defaultSession.resolveProxy("https://www.google.com");
      const [protocol, address] = proxyString.split(";")[0].split(" ");
      console.log("proxy url", protocol, address);
      this.proxyUrl = protocol === "PROXY" ? `http://${address}` : null;

      if (this.proxyUrl) {
        process.env.http_proxy = this.proxyUrl;
        process.env.https_proxy = this.proxyUrl;
        process.env.HTTP_PROXY = this.proxyUrl;
        process.env.HTTPS_PROXY = this.proxyUrl;
        process.env.GRPC_PROXY = this.proxyUrl;
        process.env.grpc_proxy = this.proxyUrl;
        const mergedNoProxy = mergeNoProxy(NO_PROXY);
        process.env.no_proxy = mergedNoProxy;
        process.env.NO_PROXY = mergedNoProxy;
        setGlobalDispatcher(
          new EnvHttpProxyAgent({
            httpProxy: this.proxyUrl,
            httpsProxy: this.proxyUrl,
            noProxy: mergedNoProxy,
          }),
        );
      }
      eventBus.sendToMain(CONFIG_EVENTS.PROXY_RESOLVED);
    } catch (error) {
      console.error("Failed to resolve proxy:", error);
      return;
    }
  }

  private clearProxy(): void {
    this.proxyUrl = null;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.GRPC_PROXY;
    delete process.env.grpc_proxy;
    delete process.env.no_proxy;
    delete process.env.NO_PROXY;
    session.defaultSession.setProxy({ mode: "direct" });
    setGlobalDispatcher(new Agent());
  }

  private setCustomProxy(proxyUrl: string): void {
    this.proxyUrl = proxyUrl;
    process.env.http_proxy = proxyUrl;
    process.env.https_proxy = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.GRPC_PROXY = proxyUrl;
    process.env.grpc_proxy = proxyUrl;
    const mergedNoProxy = mergeNoProxy(NO_PROXY);
    process.env.no_proxy = mergedNoProxy;
    process.env.NO_PROXY = mergedNoProxy;
    session.defaultSession.setProxy({ proxyRules: proxyUrl });
    setGlobalDispatcher(
      new EnvHttpProxyAgent({
        httpProxy: proxyUrl,
        httpsProxy: proxyUrl,
        noProxy: mergedNoProxy,
      }),
    );
  }

  /**
   * Validate whether a proxy URL is valid
   * @param url the proxy URL to validate
   * @returns whether it is a valid proxy URL
   */
  isValidProxyUrl(url: string): boolean {
    if (!url || url.trim() === "") {
      return false;
    }

    try {
      // Check the URL format; ensure it starts with http:// or https://
      const urlPattern =
        /^(http|https):\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(:[0-9]+)?(\/[^\s]*)?$/;
      if (!urlPattern.test(url)) {
        return false;
      }

      // Try to parse the URL
      const parsedUrl = new URL(url);
      // Ensure the port is a valid number (if a port is specified)
      if (parsedUrl.port && isNaN(parseInt(parsedUrl.port))) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Invalid proxy URL:", error);
      return false;
    }
  }

  getProxyUrl(): string | null {
    return this.proxyUrl;
  }

  getProxyMode(): ProxyMode {
    return this.mode;
  }

  setProxyMode(mode: ProxyMode): void {
    this.mode = mode;
  }

  getCustomProxyUrl(): string {
    return this.customProxyUrl;
  }

  setCustomProxyUrl(url: string): void {
    // Only set a valid URL; otherwise keep the existing value
    if (this.isValidProxyUrl(url) || url.trim() === "") {
      this.customProxyUrl = url;
    } else {
      console.warn("Invalid proxy URL format:", url);
    }
  }

  // Initialize proxy settings from configuration
  initFromConfig(mode: ProxyMode, customUrl: string): void {
    this.mode = mode;
    // In custom mode, validate the URL
    if (mode === ProxyMode.CUSTOM && customUrl) {
      if (this.isValidProxyUrl(customUrl)) {
        this.customProxyUrl = customUrl;
      } else {
        console.warn("Invalid custom proxy URL in config, fallback to system proxy mode");
        this.mode = ProxyMode.SYSTEM;
      }
    }
    this.resolveProxy();
  }
}
export const proxyConfig = new ProxyConfig();
