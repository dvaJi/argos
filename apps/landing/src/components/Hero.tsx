const RELEASES_URL = "https://github.com/dvaJi/argos/releases";
const GITHUB_URL = "https://github.com/dvaJi/argos";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
      <div
        className="absolute left-1/2 top-0 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Open Source · Apache 2.0
          </span>
          <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
            One desktop app for{" "}
            <span className="bg-gradient-to-r from-accent to-cyan-200 bg-clip-text text-transparent">
              every AI agent
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300">
            Argos unifies models, tools, and agents — multi-LLM chat, MCP tool calling, installable Skills, ACP agent
            integration, and remote control from your favorite messaging apps.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#download"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-ink shadow-lg shadow-accent/20 transition hover:bg-accent-strong sm:w-auto"
            >
              Download for free
              <svg className="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0112 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0022 12.25C22 6.58 17.52 2 12 2z" />
              </svg>
              Star on GitHub
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Available for{" "}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Windows, macOS &amp; Linux
            </a>{" "}
            — also on{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-accent">
              brew install --cask argos
            </code>
          </p>
        </div>
      </div>
    </section>
  );
}
