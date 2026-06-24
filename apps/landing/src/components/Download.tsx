const RELEASES_URL = "https://github.com/dvaJi/argos/releases";
const WEBSITE_URL = "https://argos.aipurrjects.xyz/#/download";

type Platform = {
  name: string;
  detail: string;
  href: string;
  icon: React.ReactNode;
  primary?: boolean;
};

const PLATFORMS: Platform[] = [
  {
    name: "Windows",
    detail: ".exe installer",
    href: RELEASES_URL,
    primary: true,
    icon: (
      <path
        d="M3 5l8-1v8H3V5zm0 9h8v6l-8-1v-5zm9-10l9-1v10h-9V4zm0 9h9v7l-9-1v-6z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "macOS",
    detail: ".dmg · Homebrew",
    href: RELEASES_URL,
    primary: true,
    icon: (
      <path
        d="M16 3c0 1.5-1.3 2.7-2.8 2.7C13 4.2 14.3 3 16 3zm1.6 16.4c-.6 1.4-1 2-1.8 3.2-.9 1.4-2.2 3.1-3.8 3.1-1 0-1.6-.6-2.7-.6s-1.8.6-2.7.6c-1.6 0-2.8-1.6-3.8-3-2.4-3.4-2.6-7.3-1.1-9.4 1-1.4 2.6-2.2 4.1-2.2 1.4 0 2.3.7 3.4.7 1.1 0 1.7-.7 3.4-.7 1.3 0 2.7.7 3.7 1.9-3.2 1.7-2.6 6.3.3 7.4z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Linux",
    detail: ".AppImage · .deb",
    href: RELEASES_URL,
    primary: true,
    icon: (
      <path
        d="M9 8h6m-6 4h6m-9 4h12M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function Download() {
  return (
    <section id="download" className="relative overflow-hidden border-b border-white/5 py-24">
      <div className="absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 bg-accent/5 blur-[100px]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Get Argos — free &amp; open source
          </h2>
          <p className="mt-4 text-lg text-slate-400">Pick your platform and start in minutes. No account required.</p>
        </div>
        <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-3">
          {PLATFORMS.map((platform) => (
            <a
              key={platform.name}
              href={platform.href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-ink-soft/60 p-8 text-center transition hover:border-accent/40 hover:bg-ink-soft"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent transition group-hover:scale-105">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  {platform.icon}
                </svg>
              </span>
              <span className="text-lg font-semibold text-white">{platform.name}</span>
              <span className="text-sm text-slate-400">{platform.detail}</span>
            </a>
          ))}
        </div>
        <div className="mx-auto mt-10 max-w-2xl space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-6 py-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-slate-300">brew install --cask argos</span>
            </div>
            <span className="text-xs text-slate-500">macOS via Homebrew</span>
          </div>
          <p className="text-center text-sm text-slate-400">
            Prefer the official website?{" "}
            <a href={WEBSITE_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Download from argos.aipurrjects.xyz
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
