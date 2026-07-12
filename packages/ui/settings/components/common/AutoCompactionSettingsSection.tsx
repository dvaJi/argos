import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Input } from "#shadcn/components/ui/input";
import { Slider } from "#shadcn/components/ui/slider";
import {
  AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MAX,
  AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MIN,
  AUTO_COMPACTION_TRIGGER_THRESHOLD_MAX,
  AUTO_COMPACTION_TRIGGER_THRESHOLD_MIN,
  AUTO_COMPACTION_TRIGGER_THRESHOLD_STEP,
  uiSettingsStore,
  setAutoCompactionEnabled,
  setAutoCompactionTriggerThreshold,
  setAutoCompactionRetainRecentPairs,
} from "#/stores/uiSettingsStore";
import SettingToggleRow from "./SettingToggleRow";

export default function AutoCompactionSettingsSection() {
  const autoCompactionEnabled = useStore(uiSettingsStore, (s) => s.autoCompactionEnabled);
  const autoCompactionTriggerThreshold = useStore(uiSettingsStore, (s) => s.autoCompactionTriggerThreshold);
  const autoCompactionRetainRecentPairs = useStore(uiSettingsStore, (s) => s.autoCompactionRetainRecentPairs);
  const controlsDisabled = !autoCompactionEnabled;
  const thresholdDisplay = `${autoCompactionTriggerThreshold}%`;

  const handleEnabledChange = (value: boolean) => {
    void setAutoCompactionEnabled(value);
  };

  const handleThresholdChange = (value: number[] | undefined) => {
    const nextValue = value?.[0];
    if (typeof nextValue !== "number" || Number.isNaN(nextValue)) {
      return;
    }
    void setAutoCompactionTriggerThreshold(nextValue);
  };

  const handleRetainRecentPairsInput = (value: string | number) => {
    if (value === "") {
      return;
    }
    const parsed = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(parsed)) {
      return;
    }
    void setAutoCompactionRetainRecentPairs(parsed);
  };

  return (
    <section className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2 h-10 text-sm font-medium text-muted-foreground">
        <Icon icon="lucide:sparkles" className="w-4 h-4" />
        <span>Auto Compaction</span>
      </div>

      <div className="rounded-lg border border-border bg-card/30 px-4 py-4">
        <div className="flex flex-col gap-3">
          <SettingToggleRow
            id="auto-compaction-switch"
            icon="lucide:scaling"
            label="Enable auto compaction"
            modelValue={autoCompactionEnabled}
            onUpdateModelValue={handleEnabledChange}
          />

          <p className="pl-6 text-xs leading-6 text-muted-foreground">
            Automatically compact conversations to manage context window usage.
          </p>

          <div className="flex flex-col gap-4 pl-6" style={{ opacity: controlsDisabled ? 0.6 : undefined }}>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Compaction threshold</span>
                <span className="text-xs text-muted-foreground">{thresholdDisplay}</span>
              </div>

              <Slider
                id="auto-compaction-threshold-slider"
                data-testid="auto-compaction-threshold-slider"
                value={[autoCompactionTriggerThreshold]}
                min={AUTO_COMPACTION_TRIGGER_THRESHOLD_MIN}
                max={AUTO_COMPACTION_TRIGGER_THRESHOLD_MAX}
                step={AUTO_COMPACTION_TRIGGER_THRESHOLD_STEP}
                disabled={controlsDisabled}
                onValueChange={handleThresholdChange}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{AUTO_COMPACTION_TRIGGER_THRESHOLD_MIN}%</span>
                <span>{AUTO_COMPACTION_TRIGGER_THRESHOLD_MAX}%</span>
              </div>

              <p className="text-xs leading-6 text-muted-foreground">
                Percentage of context window usage that triggers auto compaction.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Recent pairs to retain</span>
                <span className="text-xs text-muted-foreground">
                  {autoCompactionRetainRecentPairs} pair
                  {autoCompactionRetainRecentPairs !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center">
                <Input
                  id="auto-compaction-retain-pairs-input"
                  data-testid="auto-compaction-retain-pairs-input"
                  type="number"
                  className="h-8 w-24 text-center"
                  min={AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MIN}
                  max={AUTO_COMPACTION_RETAIN_RECENT_PAIRS_MAX}
                  disabled={controlsDisabled}
                  value={autoCompactionRetainRecentPairs}
                  onChange={(e) => handleRetainRecentPairsInput(e.target.value)}
                />
              </div>

              <p className="text-xs leading-6 text-muted-foreground">
                Number of recent message pairs to keep during compaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
