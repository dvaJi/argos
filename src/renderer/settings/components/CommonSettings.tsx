import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import {
  useUiSettingsStore,
  setAutoScrollEnabled,
  setLaunchAtLoginEnabled,
  setCopyWithCotEnabled,
  setTraceDebugEnabled,
} from "@/stores/uiSettingsStore";
import ProxySettingsSection from "./common/ProxySettingsSection";
import LoggingSettingsSection from "./common/LoggingSettingsSection";
import SettingToggleRow from "./common/SettingToggleRow";
import UploadFileSettingsSection from "./common/UploadFileSettingsSection";
import SettingsPageShell from "./control-center/SettingsPageShell";

export default function CommonSettings() {
  const uiSettingsStore = useUiSettingsStore();

  const autoScrollEnabled = useMemo(() => uiSettingsStore.autoScrollEnabled, [uiSettingsStore.autoScrollEnabled]);
  const copyWithCotEnabled = useMemo(() => uiSettingsStore.copyWithCotEnabled, [uiSettingsStore.copyWithCotEnabled]);
  const traceDebugEnabled = useMemo(() => uiSettingsStore.traceDebugEnabled, [uiSettingsStore.traceDebugEnabled]);
  const launchAtLoginEnabled = useMemo(
    () => uiSettingsStore.launchAtLoginEnabled,
    [uiSettingsStore.launchAtLoginEnabled],
  );

  const handleAutoScrollChange = useCallback((value: boolean) => setAutoScrollEnabled(value), []);
  const handleLaunchAtLoginChange = useCallback((value: boolean) => setLaunchAtLoginEnabled(value), []);
  const handleCopyWithCotChange = useCallback((value: boolean) => setCopyWithCotEnabled(value), []);
  const handleTraceDebugChange = useCallback((value: boolean) => setTraceDebugEnabled(value), []);

  return (
    <SettingsPageShell title="General" eyebrow="Setup" data-testid="settings-general-page">
      <div className="flex w-full flex-col gap-3">
        <UploadFileSettingsSection />
        <ProxySettingsSection />
        <SettingToggleRow
          id="launch-at-login-switch"
          icon="lucide:power"
          label="Launch at Login"
          modelValue={launchAtLoginEnabled}
          onUpdateModelValue={handleLaunchAtLoginChange}
        />
        <SettingToggleRow
          id="auto-scroll-switch"
          icon="lucide:arrow-down"
          label="Auto Scroll"
          modelValue={autoScrollEnabled}
          onUpdateModelValue={handleAutoScrollChange}
        />
        <SettingToggleRow
          id="copy-with-cot-switch"
          icon="lucide:file-text"
          label="Copy with Chain of Thought"
          modelValue={copyWithCotEnabled}
          onUpdateModelValue={handleCopyWithCotChange}
        />
        <SettingToggleRow
          id="trace-debug-switch"
          icon="lucide:bug"
          label="Trace Debug"
          modelValue={traceDebugEnabled}
          onUpdateModelValue={handleTraceDebugChange}
        />
        <LoggingSettingsSection />
      </div>
    </SettingsPageShell>
  );
}
