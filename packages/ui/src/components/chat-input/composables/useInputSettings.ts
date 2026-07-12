import { useState, useEffect } from "react";
import { createConfigClient } from "#api/ConfigClient";

export function useInputSettings() {
  const configClient = createConfigClient();

  const [settings, setSettings] = useState({
    deepThinking: false,
  });

  const toggleDeepThinking = async () => {
    const previousValue = settings.deepThinking;
    setSettings((prev) => ({ ...prev, deepThinking: !prev.deepThinking }));

    try {
      await configClient.setSetting("input_deepThinking", !settings.deepThinking);
    } catch (error) {
      setSettings((prev) => ({ ...prev, deepThinking: previousValue }));
      console.error("Failed to save deep thinking setting:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const value = Boolean(await configClient.getSetting("input_deepThinking"));
      setSettings({ deepThinking: value });
    } catch (error) {
      setSettings({ deepThinking: false });
      console.error("Failed to load input settings, using defaults:", error);
    }
  };

  useEffect(() => {
    loadSettings().catch((error) => {
      console.error("Failed to initialize input settings:", error);
    });
  }, []);

  return {
    settings,
    toggleDeepThinking,
    loadSettings,
  };
}
