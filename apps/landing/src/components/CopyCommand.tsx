import { Check, CopySimple } from "@phosphor-icons/react";
import { useState } from "react";

export function CopyCommand({
  command,
  label,
  className = "",
}: {
  command: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className={`flex max-w-full items-center gap-3 border border-white/10 bg-white/[0.03] ${className}`}>
      {label ? <span className="shrink-0 text-xs text-slate-500">{label}</span> : null}
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied to clipboard" : "Copy command"}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white"
      >
        {copied ? <Check size={15} weight="bold" className="text-accent" /> : <CopySimple size={15} />}
      </button>
    </div>
  );
}
