/**
 * Configuration initialization hook for init phase
 * Initializes application configuration
 *
 * Setup log and proxy
 */

import { LifecycleHook, LifecycleContext } from "@argos/shared/presenter";
import { createLogger, setLoggingEnabled } from "@argos/shared/logger";
import { proxyConfig, ProxyMode } from "#/presenter/proxyConfig";
import { ConfigPresenter } from "#/presenter/configPresenter";
import { LifecyclePhase } from "@argos/shared/lifecycle";

const log = createLogger("Config");

export const configInitHook: LifecycleHook = {
  name: "config-initialization",
  phase: LifecyclePhase.INIT,
  priority: 1, // first in init phase
  critical: true,
  execute: async (context: LifecycleContext) => {
    log.info("Initializing application configuration");

    // Ensure presenter is available (should be initialized by database hook)
    log.info("Creating ConfigPresenter");
    const configPresenter = new ConfigPresenter();
    log.info("ConfigPresenter created");

    // Read logging settings from config and apply
    const loggingEnabled = configPresenter.getLoggingEnabled();
    setLoggingEnabled(loggingEnabled);

    // Read proxy settings from config and initialize
    const proxyMode = configPresenter.getProxyMode() as ProxyMode;
    const customProxyUrl = configPresenter.getCustomProxyUrl();
    proxyConfig.initFromConfig(proxyMode as ProxyMode, customProxyUrl);

    // Store config in context for other hooks
    context.config = configPresenter;

    log.info("Application configuration initialized successfully");
  },
};
