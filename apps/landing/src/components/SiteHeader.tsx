import { Link } from "@tanstack/react-router";

const GITHUB_URL = "https://github.com/dvaJi/argos";
const RELEASES_URL = "https://github.com/dvaJi/argos/releases";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/30 bg-accent/10 font-mono text-lg font-bold text-accent">
            A
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">Argos</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#features" className="transition hover:text-accent">
            Features
          </a>
          <a href="#providers" className="transition hover:text-accent">
            Providers
          </a>
          <a href="#download" className="transition hover:text-accent">
            Download
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden text-sm text-slate-300 transition hover:text-white sm:inline"
          >
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-strong"
          >
            Get Argos
          </a>
        </div>
      </nav>
    </header>
  );
}
