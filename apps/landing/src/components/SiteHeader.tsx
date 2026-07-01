import { GithubLogo, List, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const GITHUB_URL = "https://github.com/dvaJi/argos";
const RELEASES_URL = "https://github.com/dvaJi/argos/releases";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Providers", href: "/#providers" },
  { label: "Docs", href: "/docs" },
  { label: "Download", href: "/#download" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="fixed top-5 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-ink/70 px-2 py-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          <Link to="/" className="flex items-center gap-2.5 rounded-full pl-3.5 pr-2" aria-label="Argos home">
            <img src="/icon.png" alt="" className="h-7 w-7 rounded-md" />
            <span className="text-sm font-semibold tracking-tight text-white">Argos</span>
          </Link>

          <div className="hidden items-center gap-0.5 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-sm text-slate-300 transition-colors duration-300 hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pr-1">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-slate-300 transition-colors duration-300 hover:bg-white/5 hover:text-white sm:inline-flex"
            >
              <GithubLogo size={17} weight="bold" />
              Star
            </a>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-transform duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            >
              Download
            </a>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors duration-300 hover:bg-white/5 md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
            </button>
          </div>
        </nav>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-ink/90 backdrop-blur-2xl transition-opacity duration-500 md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMobileOpen(false)}
      >
        <div className="flex h-full flex-col items-center justify-center gap-7">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className="text-3xl font-semibold text-white transition-all duration-500"
              style={{ transitionDelay: mobileOpen ? `${i * 70}ms` : "0ms" }}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-3xl font-semibold text-white"
            onClick={() => setMobileOpen(false)}
          >
            <GithubLogo size={28} weight="bold" /> GitHub
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-ink"
            onClick={() => setMobileOpen(false)}
          >
            Download
          </a>
        </div>
      </div>
    </>
  );
}
