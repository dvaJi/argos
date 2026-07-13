import { useMemo } from "react";
import type { FloatingWidgetSessionItem as SessionItem } from "@argos/shared/types/floating-widget";
import AgentAvatar from "./AgentAvatar";
import "./FloatingSessionItem.css";

interface FloatingSessionItemProps {
  session: SessionItem;
  theme: "dark" | "light";
  onSelect: (sessionId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  error: "Error",
  done: "Done",
};

const STATUS_CLASSES: Record<string, string> = {
  in_progress: "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-[#1a232b] dark:text-white/72",
  error: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/18 dark:bg-[#27161b] dark:text-rose-100",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/18 dark:bg-[#102219] dark:text-emerald-100",
};

const ITEM_CLASSES: Record<string, string> = {
  in_progress:
    "border-black/8 bg-white/94 hover:border-black/12 hover:bg-white dark:border-[#26303a] dark:bg-[#131a20] dark:hover:border-[#33404c] dark:hover:bg-[#192128]",
  error:
    "border-rose-200/90 bg-rose-50/88 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/14 dark:bg-[#1c1418] dark:hover:border-rose-400/22 dark:hover:bg-[#24181d]",
  done: "border-black/8 bg-white/94 hover:border-emerald-200 hover:bg-white dark:border-[#26303a] dark:bg-[#131a20] dark:hover:border-emerald-500/20 dark:hover:bg-[#192128]",
};

const ACCENT_CLASSES: Record<string, string> = {
  in_progress: "bg-slate-400/80 shadow-[0_0_16px_rgba(148,163,184,0.22)] dark:bg-white/24 dark:shadow-none",
  error:
    "bg-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.2)] dark:bg-rose-300 dark:shadow-[0_0_18px_rgba(251,113,133,0.26)]",
  done: "bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.26)] dark:bg-emerald-300 dark:shadow-[0_0_18px_rgba(52,211,153,0.38)]",
};

const DOT_CLASSES: Record<string, string> = {
  in_progress: "bg-slate-500 shadow-[0_0_10px_rgba(100,116,139,0.28)] animate-pulse dark:bg-white/55 dark:shadow-none",
  error: "bg-rose-500 dark:bg-rose-300",
  done: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.28)] dark:bg-emerald-300 dark:shadow-[0_0_10px_rgba(52,211,153,0.7)]",
};

export default function FloatingSessionItem({ session, theme, onSelect }: FloatingSessionItemProps) {
  const statusKey =
    session.status === "done" || session.status === "error" || session.status === "in_progress"
      ? session.status
      : "done";

  const statusLabel = STATUS_LABELS[statusKey];
  const statusClass = STATUS_CLASSES[statusKey];
  const itemClass = ITEM_CLASSES[statusKey];
  const accentClass = ACCENT_CLASSES[statusKey];
  const dotClass = DOT_CLASSES[statusKey];

  return (
    <button
      type="button"
      data-no-drag
      className={`session-card group flex w-full items-center gap-3 border px-4 py-3 text-left ${itemClass}`}
      onClick={() => onSelect(session.id)}
    >
      <span className={`h-8 w-1.5 shrink-0 rounded-full ${accentClass}`} />

      <AgentAvatar agent={session.agent} theme={theme} className="h-5 w-5" fallbackClassName="rounded-lg" />

      <div className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground/90 dark:text-white/94">
        {session.title || "New Chat"}
      </div>

      <div
        className={`flex min-w-14 box-border items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-1 text-[11px] font-medium ${statusClass}`}
      >
        <div className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
        <div>{statusLabel}</div>
      </div>
    </button>
  );
}
