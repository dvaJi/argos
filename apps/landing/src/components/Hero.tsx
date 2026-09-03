import { DownloadSimple } from "@phosphor-icons/react";
import { CopyCommand } from "~/components/CopyCommand";
import { ShaderBackdrop } from "~/components/ShaderBackdrop";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mesh-gradient absolute inset-0" aria-hidden="true" />
      <ShaderBackdrop />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl grid-cols-1 items-center gap-14 px-6 pb-20 pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28">
        <div className="max-w-xl">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-sm">
              Open source <span className="text-slate-600">Apache 2.0</span>
            </span>
          </div>

          <h1 className="animate-fade-up-1 mt-7 text-balance text-[2.6rem] font-bold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-[3.9rem]">
            The control plane for AI coding agents.
          </h1>

          <p className="animate-fade-up-2 mt-6 max-w-[52ch] text-pretty text-lg leading-relaxed text-slate-400">
            Run agents, models, MCP tools, and skills in one workspace. Bring your own keys, keep your workflow, own the
            stack.
          </p>

          <div className="animate-fade-up-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#download"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-ink transition-transform duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            >
              <DownloadSimple size={20} weight="bold" />
              Download
            </a>
            <CopyCommand command="brew install --cask argos" className="rounded-full py-2 pl-5 pr-2 backdrop-blur-sm" />
          </div>
        </div>

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
