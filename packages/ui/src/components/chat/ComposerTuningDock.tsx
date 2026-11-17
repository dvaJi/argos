import { Icon } from "@iconify/react";
import {
  PERMISSION_MODE_OPTIONS,
  isPermissionOptionActive,
  labelForEffort,
  useComposerPermissionMode,
  useComposerReasoning,
} from "#/composables/chat/useComposerGenerationControls";
import type { ReasoningEffort } from "@argos/shared/types/model-db";

/** Compact tab labels (the footer chip keeps the longer `labelForEffort`). */
const EFFORT_TAB_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Xhigh",
  max: "Max",
};
const EFFORT_HINTS: Record<ReasoningEffort, string> = {
  none: "No reasoning",
  minimal: "Near-instant replies",
  low: "Fastest replies",
  medium: "Balanced speed and depth",
  high: "Thinks deeper",
  xhigh: "Extended thinking",
  max: "Deepest reasoning, slowest",
};

const DockRow = ({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-medium text-muted-foreground">{label}</span>
      {aside}
    </div>
    {children}
  </div>
);

/**
 * Bottom dock of the composer model picker: reasoning-effort tabs and an
 * access toggle for the selected model. Lives inside the popover so they can
 * be tuned right after picking a model (selection keeps the popover open).
 */
const ComposerTuningDock = () => {
  const { supportsReasoning, efforts, defaultEffort, activeEffort, setEffort } = useComposerReasoning();
  const { mode, setMode } = useComposerPermissionMode();
  const reasoningReady = supportsReasoning === true && efforts.length > 0;
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/30 px-3 py-2.5">
      <DockRow
        label="Effort"
        aside={
          <span className="text-muted-foreground/70">
            {reasoningReady
              ? EFFORT_HINTS[activeEffort]
              : supportsReasoning === null
                ? "Loading…"
                : "Not supported by this model"}
          </span>
        }
      >
        {reasoningReady && (
          <div className="flex gap-0.5 rounded-md bg-foreground/5 p-0.5" role="tablist" aria-label="Reasoning effort">
            {efforts.map((effort) => {
              const active = effort === activeEffort;
              return (
                <button
                  key={effort}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={effort === defaultEffort ? `${labelForEffort(effort)} (default)` : labelForEffort(effort)}
                  data-testid={`model-picker-effort-${effort}`}
                  className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors ${
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  } ${effort === defaultEffort ? "font-semibold" : ""}`}
                  onClick={() => void setEffort(effort)}
                >
                  {EFFORT_TAB_LABELS[effort]}
                </button>
              );
            })}
          </div>
        )}
      </DockRow>
      <DockRow label="Access">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-foreground/5 p-0.5" role="radiogroup" aria-label="Access">
          {PERMISSION_MODE_OPTIONS.filter((opt) => !opt.disabled).map((opt) => {
            const active = isPermissionOptionActive(mode, opt);
            return (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={active}
                title={opt.description}
                data-testid={`model-picker-permission-${opt.value}`}
                className={`flex items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => void setMode(opt.value)}
              >
                <Icon icon={opt.icon} className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </DockRow>
    </div>
  );
};

export default ComposerTuningDock;
