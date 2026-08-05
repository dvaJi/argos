import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  useUiSettingsStore,
  setAutoScrollEnabled,
  setLaunchAtLoginEnabled,
  setCopyWithCotEnabled,
  setTraceDebugEnabled,
  setShowContinueIndicator,
} from "#/stores/uiSettingsStore";
import ProxySettingsSection from "./common/ProxySettingsSection";
import LoggingSettingsSection from "./common/LoggingSettingsSection";
import SettingToggleRow from "./common/SettingToggleRow";
import UploadFileSettingsSection from "./common/UploadFileSettingsSection";
import SettingsPageShell from "./control-center/SettingsPageShell";

export default function CommonSettings() {
  const uiSettingsStore = useUiSettingsStore();

  const { autoScrollEnabled, copyWithCotEnabled, traceDebugEnabled, showContinueIndicator, launchAtLoginEnabled } =
    uiSettingsStore;

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
          onUpdateModelValue={setLaunchAtLoginEnabled}
        />
        <SettingToggleRow
          id="auto-scroll-switch"
          icon="lucide:arrow-down"
          label="Auto Scroll"
          modelValue={autoScrollEnabled}
          onUpdateModelValue={setAutoScrollEnabled}
        />
        <SettingToggleRow
          id="copy-with-cot-switch"
          icon="lucide:file-text"
          label="Copy with Chain of Thought"
          modelValue={copyWithCotEnabled}
          onUpdateModelValue={setCopyWithCotEnabled}
        />
        <SettingToggleRow
          id="trace-debug-switch"
          icon="lucide:bug"
          label="Trace Debug"
          modelValue={traceDebugEnabled}
          onUpdateModelValue={setTraceDebugEnabled}
        />
        <SettingToggleRow
          id="show-continue-indicator-switch"
          icon="lucide:rotate-cw"
          label="Show 'Continued' Indicator"
          modelValue={showContinueIndicator}
          onUpdateModelValue={setShowContinueIndicator}
        />
        <LoggingSettingsSection />
      </div>
    </SettingsPageShell>
  );
}
