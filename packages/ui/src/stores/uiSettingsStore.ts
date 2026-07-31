import { Store } from "@tanstack/store";
import { useSelector, shallow } from "@tanstack/react-store";
import type { SettingsChange, SettingsSnapshotValues } from "@argos/shared-contracts/routes";
import { buildFontStack, DEFAULT_CODE_FONT_STACK, DEFAULT_TEXT_FONT_STACK } from "#/lib/fontStack";
import { createSettingsClient } from "../../api/SettingsClient";

const FONT_SIZE_CLASSES = ["text-sm", "text-base", "text-lg", "text-xl", "text-2xl"];
const DEFAULT_FONT_SIZE_LEVEL = 1;
const AUTO_COMPACTION_TRIGGER_THRESHOLD_MIN = 5;
const AUTO_COMPACTION_TRIGGER_THRESHOLD_MAX = 95;
const AUTO_COMPACTION_TRIGGER_THRESHOLD_STEP = 5;
const AUTO_COMPACTION_TRIGGER_THRESHOLD_DEFAULT = 80;
const AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MIN = 1;
const AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MAX = 10;
const AUTO_COMPACTION_RETAIN_RECENT_PAIRS_DEFAULT = 2;

const clampFontSizeLevel = (level: number) => Math.max(0, Math.min(level, FONT_SIZE_CLASSES.length - 1));

const settingsClient = createSettingsClient();
let unsubscribeFromSettings: (() => void) | null = null;
let settingsLoadPromise: Promise<void> | null = null;

export const uiSettingsStore = new Store({
  fontSizeLevel: DEFAULT_FONT_SIZE_LEVEL,
  fontFamily: "",
  codeFontFamily: "",
  systemFonts: [] as string[],
  isLoadingFonts: false,
  artifactsEffectEnabled: false,
  autoScrollEnabled: true,
  contentProtectionEnabled: false,
  privacyModeEnabled: false,
  copyWithCotEnabled: true,
  launchAtLoginEnabled: false,
  autoCompactionEnabled: true,
  autoCompactionTriggerThreshold: AUTO_COMPACTION_TRIGGER_THRESHOLD_DEFAULT,
  autoCompactionRetainRecentPairs: AUTO_COMPACTION_RETAIN_RECENT_PAIRS_DEFAULT,
  traceDebugEnabled: false,
  notificationsEnabled: true,
  loggingEnabled: false,
});

export const getFontSizeClass = (fontSizeLevel?: number) =>
  FONT_SIZE_CLASSES[fontSizeLevel ?? uiSettingsStore.state.fontSizeLevel] || FONT_SIZE_CLASSES[DEFAULT_FONT_SIZE_LEVEL];

export const getFormattedFontFamily = () => buildFontStack(uiSettingsStore.state.fontFamily, DEFAULT_TEXT_FONT_STACK);

export const getFormattedCodeFontFamily = () =>
  buildFontStack(uiSettingsStore.state.codeFontFamily, DEFAULT_CODE_FONT_STACK);

const applySettingsValues = (values: Partial<SettingsSnapshotValues>) => {
  const patch: Partial<typeof uiSettingsStore.state> = {};
  if (typeof values.fontSizeLevel === "number") {
    patch.fontSizeLevel = clampFontSizeLevel(values.fontSizeLevel);
  }
  if (typeof values.fontFamily === "string") {
    patch.fontFamily = values.fontFamily;
  }
  if (typeof values.codeFontFamily === "string") {
    patch.codeFontFamily = values.codeFontFamily;
  }
  if (typeof values.artifactsEffectEnabled === "boolean") {
    patch.artifactsEffectEnabled = values.artifactsEffectEnabled;
  }
  if (typeof values.autoScrollEnabled === "boolean") {
    patch.autoScrollEnabled = values.autoScrollEnabled;
  }
  if (typeof values.autoCompactionEnabled === "boolean") {
    patch.autoCompactionEnabled = values.autoCompactionEnabled;
  }
  if (typeof values.autoCompactionTriggerThreshold === "number") {
    patch.autoCompactionTriggerThreshold = values.autoCompactionTriggerThreshold;
  }
  if (typeof values.autoCompactionRetainRecentPairs === "number") {
    patch.autoCompactionRetainRecentPairs = values.autoCompactionRetainRecentPairs;
  }
  if (typeof values.contentProtectionEnabled === "boolean") {
    patch.contentProtectionEnabled = values.contentProtectionEnabled;
  }
  if (typeof values.privacyModeEnabled === "boolean") {
    patch.privacyModeEnabled = values.privacyModeEnabled;
  }
  if (typeof values.notificationsEnabled === "boolean") {
    patch.notificationsEnabled = values.notificationsEnabled;
  }
  if (typeof values.launchAtLoginEnabled === "boolean") {
    patch.launchAtLoginEnabled = values.launchAtLoginEnabled;
  }
  if (typeof values.traceDebugEnabled === "boolean") {
    patch.traceDebugEnabled = values.traceDebugEnabled;
  }
  if (typeof values.copyWithCotEnabled === "boolean") {
    patch.copyWithCotEnabled = values.copyWithCotEnabled;
  }
  if (typeof values.loggingEnabled === "boolean") {
    patch.loggingEnabled = values.loggingEnabled;
  }
  if (Object.keys(patch).length > 0) {
    uiSettingsStore.setState((s) => ({ ...s, ...patch }));
  }
};

const updateSettings = async (changes: SettingsChange[]) => {
  if (settingsLoadPromise) {
    await settingsLoadPromise;
  }
  const result = await settingsClient.update(changes);
  applySettingsValues(result.values);
};

export const loadSettings = async () => {
  if (settingsLoadPromise) {
    await settingsLoadPromise;
    return;
  }
  const nextLoadPromise = (async () => {
    const snapshot = await settingsClient.getSnapshot();
    applySettingsValues(snapshot);
  })();
  settingsLoadPromise = nextLoadPromise;
  try {
    await nextLoadPromise;
  } finally {
    if (settingsLoadPromise === nextLoadPromise) {
      settingsLoadPromise = null;
    }
  }
};

export const updateFontSizeLevel = async (level: number) => {
  const nextValue = clampFontSizeLevel(level);
  uiSettingsStore.setState((s) => ({ ...s, fontSizeLevel: nextValue }));
  await updateSettings([{ key: "fontSizeLevel", value: nextValue }]);
};

export const setFontFamily = async (value: string) => {
  const nextValue = (value || "").trim();
  uiSettingsStore.setState((s) => ({ ...s, fontFamily: nextValue }));
  await updateSettings([{ key: "fontFamily", value: nextValue }]);
};

export const setCodeFontFamily = async (value: string) => {
  const nextValue = (value || "").trim();
  uiSettingsStore.setState((s) => ({ ...s, codeFontFamily: nextValue }));
  await updateSettings([{ key: "codeFontFamily", value: nextValue }]);
};

export const resetFontSettings = async () => {
  uiSettingsStore.setState((s) => ({ ...s, fontFamily: "", codeFontFamily: "" }));
  await updateSettings([
    { key: "fontFamily", value: "" },
    { key: "codeFontFamily", value: "" },
  ]);
};

export const fetchSystemFonts = async () => {
  const { isLoadingFonts, systemFonts } = uiSettingsStore.state;
  if (isLoadingFonts || systemFonts.length > 0) return;
  uiSettingsStore.setState((s) => ({ ...s, isLoadingFonts: true }));
  try {
    const fonts = (await settingsClient.getSystemFonts()) || [];
    uiSettingsStore.setState((s) => ({ ...s, systemFonts: fonts }));
  } catch (error) {
    console.warn("Failed to fetch system fonts", error);
  } finally {
    uiSettingsStore.setState((s) => ({ ...s, isLoadingFonts: false }));
  }
};

export const setAutoScrollEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, autoScrollEnabled: nextValue }));
  await updateSettings([{ key: "autoScrollEnabled", value: nextValue }]);
};

const setAutoCompactionEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, autoCompactionEnabled: nextValue }));
  await updateSettings([{ key: "autoCompactionEnabled", value: nextValue }]);
};

const setAutoCompactionTriggerThreshold = async (threshold: number) => {
  const rounded =
    Math.round(threshold / AUTO_COMPACTION_TRIGGER_THRESHOLD_STEP) * AUTO_COMPACTION_TRIGGER_THRESHOLD_STEP;
  const nextValue = Math.min(
    AUTO_COMPACTION_TRIGGER_THRESHOLD_MAX,
    Math.max(AUTO_COMPACTION_TRIGGER_THRESHOLD_MIN, rounded),
  );
  uiSettingsStore.setState((s) => ({ ...s, autoCompactionTriggerThreshold: nextValue }));
  await updateSettings([{ key: "autoCompactionTriggerThreshold", value: nextValue }]);
};

const setAutoCompactionRetainRecentPairs = async (count: number) => {
  const nextValue = Math.min(
    AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MAX,
    Math.max(AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MIN, Math.round(count)),
  );
  uiSettingsStore.setState((s) => ({ ...s, autoCompactionRetainRecentPairs: nextValue }));
  await updateSettings([{ key: "autoCompactionRetainRecentPairs", value: nextValue }]);
};

const setArtifactsEffectEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, artifactsEffectEnabled: nextValue }));
  await updateSettings([{ key: "artifactsEffectEnabled", value: nextValue }]);
};

export const setContentProtectionEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, contentProtectionEnabled: nextValue }));
  await updateSettings([{ key: "contentProtectionEnabled", value: nextValue }]);
};

export const setPrivacyModeEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  await updateSettings([{ key: "privacyModeEnabled", value: nextValue }]);
};

export const setCopyWithCotEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, copyWithCotEnabled: nextValue }));
  await updateSettings([{ key: "copyWithCotEnabled", value: nextValue }]);
};

export const setTraceDebugEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, traceDebugEnabled: nextValue }));
  await updateSettings([{ key: "traceDebugEnabled", value: nextValue }]);
};

export const setNotificationsEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, notificationsEnabled: nextValue }));
  await updateSettings([{ key: "notificationsEnabled", value: nextValue }]);
};

export const setLaunchAtLoginEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  await updateSettings([{ key: "launchAtLoginEnabled", value: nextValue }]);
  uiSettingsStore.setState((s) => ({ ...s, launchAtLoginEnabled: nextValue }));
};

export const setLoggingEnabled = async (enabled: boolean) => {
  const nextValue = Boolean(enabled);
  uiSettingsStore.setState((s) => ({ ...s, loggingEnabled: nextValue }));
  await updateSettings([{ key: "loggingEnabled", value: nextValue }]);
};

const setupListeners = () => {
  if (unsubscribeFromSettings) return;
  unsubscribeFromSettings = settingsClient.onChanged((payload) => {
    applySettingsValues(payload.values);
  });
};

const initUiSettings = () => {
  void loadSettings();
  setupListeners();
};

const destroyUiSettings = () => {
  unsubscribeFromSettings?.();
  unsubscribeFromSettings = null;
};

export function useUiSettingsStore() {
  return useSelector(uiSettingsStore, (s) => s, { compare: shallow });
}
