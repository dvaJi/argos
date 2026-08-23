import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  useUiSettingsStore,
  setAutoScrollEnabled,
  setLaunchAtLoginEnabled,
  setCopyWithCotEnabled,
  setTraceDebugEnabled,
  setShowContinueIndicator,
  setHideReasoningOnFinishedTurn,
} from "#/stores/uiSettingsStore";
import ProxySettingsSection from "./common/ProxySettingsSection";
import LoggingSettingsSection from "./common/LoggingSettingsSection";
import SettingToggleRow from "./common/SettingToggleRow";
import UploadFileSettingsSection from "./common/UploadFileSettingsSection";
import SettingsPageShell from "./control-center/SettingsPageShell";

export default function CommonSettings() {
  const uiSettingsStore = useUiSettingsStore();

  const {
    autoScrollEnabled,
    copyWithCotEnabled,
    traceDebugEnabled,
    showContinueIndicator,
    hideReasoningOnFinishedTurn,
    launchAtLoginEnabled,
  } = uiSettingsStore;

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
        <SettingToggleRow
          id="hide-reasoning-on-finished-turn-switch"
          icon="hugeicons:brain-01"
          label="Hide thinking on finished turns"
          modelValue={hideReasoningOnFinishedTurn}
          onUpdateModelValue={setHideReasoningOnFinishedTurn}
        />
        <LoggingSettingsSection />
      </div>
    </SettingsPageShell>
  );
}
