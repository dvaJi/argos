const GITHUB_URL = "https://github.com/dvaJi/argos";
const ISSUES_URL = "https://github.com/dvaJi/argos/issues";

export function Footer() {
  return (
    <footer className="py-14">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 border-t border-white/5 pt-10 md:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 font-mono text-sm font-bold text-accent">
              A
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Argos</p>
              <p className="text-xs text-slate-500">Open-Source AI Agent Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition hover:text-accent">
              GitHub
            </a>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="transition hover:text-accent">
              Issues
            </a>
            <a href="#features" className="transition hover:text-accent">
              Features
            </a>
            <a href="#download" className="transition hover:text-accent">
              Download
            </a>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-600">
          Argos is based on DeepChat by ThinkInAIXYZ, licensed under the Apache License 2.0.
        </p>
      </div>
    </footer>
  );
}
