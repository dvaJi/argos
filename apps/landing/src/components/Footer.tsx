import { GithubLogo } from "@phosphor-icons/react";

const GITHUB_URL = "https://github.com/dvaJi/argos";
const ISSUES_URL = "https://github.com/dvaJi/argos/issues";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="h-8 w-8 rounded-md" />
            <div>
              <p className="text-sm font-semibold text-white">Argos</p>
              <p className="text-xs text-slate-500">Open-source AI agent platform</p>
            </div>
          </div>

          <nav className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#features" className="transition-colors duration-300 hover:text-white">
              Features
            </a>
            <a href="#providers" className="transition-colors duration-300 hover:text-white">
              Providers
            </a>
            <a href="#download" className="transition-colors duration-300 hover:text-white">
              Download
            </a>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors duration-300 hover:text-white"
            >
              Issues
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors duration-300 hover:text-white"
            >
              <GithubLogo size={16} weight="bold" /> GitHub
            </a>
          </nav>
        </div>

        <p className="mt-12 text-center text-xs leading-relaxed text-slate-600">
          Argos is based on DeepChat by ThinkInAIXYZ and licensed under the Apache License 2.0.
        </p>
      </div>
    </footer>
  );
}
