import { DownloadSimple, TerminalWindow } from "@phosphor-icons/react";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mesh-gradient absolute inset-0" aria-hidden="true" />
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        className="absolute left-[28%] top-[18%] h-[620px] w-[620px] rounded-full bg-accent/[0.07] blur-[200px] animate-pulse-glow"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl grid-cols-1 items-center gap-14 px-6 pt-24 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28">
        {/* Left: copy */}
        <div className="max-w-xl">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-sm">
              Open source <span className="text-slate-600">Apache 2.0</span>
            </span>
          </div>

          <h1 className="animate-fade-up-1 mt-7 text-balance text-[2.6rem] font-bold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4rem]">
            One AI workspace, on <span className="gradient-text">desktop or your own server.</span>
          </h1>

          <p className="animate-fade-up-2 mt-6 max-w-[52ch] text-pretty text-lg leading-relaxed text-slate-400">
            Chat with 40+ LLMs, call MCP tools, install Skills, and run ACP agents from the desktop app or a paired
            browser.
          </p>

          <div className="animate-fade-up-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#download"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-ink transition-transform duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            >
              <DownloadSimple size={20} weight="bold" />
              Download
            </a>
            <a
              href="/docs"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-7 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.07]"
            >
              <TerminalWindow size={19} weight="bold" />
              Run it headless
            </a>
          </div>
        </div>

        {/* Right: real product screenshot */}
        <div className="animate-fade-up-4 relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/[0.05] blur-3xl" aria-hidden="true" />
          <figure className="shot-frame animate-float-slow">
            <img
              src="/shot-dark.png"
              alt="Argos desktop app showing a multi-model chat session with tool calls"
              className="block w-full select-none rounded-[0.9rem]"
              loading="eager"
              fetchPriority="high"
              width={1920}
              height={1200}
            />
          </figure>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}
