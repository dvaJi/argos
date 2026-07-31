import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { ShortcutKeySetting } from "@argos/shared/presenter";
import { createShortcutRuntime } from "#api/ShortcutRuntime";
import { createConfigClient } from "../../api/ConfigClient";

const configClient = createConfigClient();
const shortcutRuntime = createShortcutRuntime();

const shortcutKeyStore = new Store({
  shortcutKeys: undefined as ShortcutKeySetting | undefined,
});

export const loadShortcutKeys = async () => {
  const customShortcutKeys = await configClient.getShortcutKey();
  shortcutKeyStore.setState((s) => ({ ...s, shortcutKeys: customShortcutKeys }));
};

export const saveShortcutKeys = async () => {
  if (!shortcutKeyStore.state.shortcutKeys) return;
  await configClient.setShortcutKey(shortcutKeyStore.state.shortcutKeys);
};

export const resetShortcutKeys = async () => {
  await configClient.resetShortcutKeys();
  await loadShortcutKeys();
};

export const enableShortcutKey = () => {
  shortcutRuntime.registerShortcuts();
};

export const disableShortcutKey = () => {
  shortcutRuntime.destroy();
};

export function useShortcutKeyStore() {
  return useStore(shortcutKeyStore);
}
