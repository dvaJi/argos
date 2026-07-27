import { Command, SquaresFour, TerminalWindow } from "@phosphor-icons/react";
import { Reveal } from "~/components/Reveal";

const RELEASES_URL = "https://github.com/dvaJi/argos/releases";
const INSTALL_RAW = "https://raw.githubusercontent.com/dvaJi/argos/main/distro/install";

const PLATFORMS = [
  { name: "Windows", detail: ".exe installer", icon: SquaresFour },
  { name: "macOS", detail: "Homebrew or .dmg", icon: Command },
  { name: "Linux", detail: ".AppImage / .deb", icon: TerminalWindow },
] as const;

const DAEMON_INSTALLS = [
  { command: "brew install dvaJi/tap/argos-daemon", label: "Homebrew" },
  { command: `curl -fsSL ${INSTALL_RAW}/install.sh | sh`, label: "macOS / Linux" },
  { command: `irm ${INSTALL_RAW}/install.ps1 | iex`, label: "Windows" },
] as const;

export function Download() {
  return (
    <section id="download" className="relative py-24 sm:py-32">
      <div
        className="absolute inset-x-0 top-1/2 h-[460px] -translate-y-1/2 bg-accent/[0.04] blur-[180px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-6">
        <Reveal className="text-center">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">Get Argos</h2>
          <p className="mx-auto mt-5 max-w-md text-lg text-slate-400">Free and open source. Pick your platform.</p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((platform, i) => {
            const Icon = platform.icon;
            return (
              <Reveal key={platform.name} delay={i * 60} className="h-full">
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="surface group flex h-full flex-col items-center p-8 text-center transition-colors duration-300 hover:border-accent/30"
                >
                  <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.06] transition-colors duration-300 group-hover:text-accent group-hover:ring-accent/25">
                    <Icon size={26} weight="regular" />
                  </span>
                  <span className="text-lg font-semibold text-white">{platform.name}</span>
                  <span className="mt-1 text-sm text-slate-500">{platform.detail}</span>
                </a>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={120} className="surface mt-6 p-7 sm:p-9">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-white">Run it headless</h3>
            <p className="mt-2 text-sm text-slate-500">
              Desktop is all most users need. Install Argos Server separately only when another machine should run
              agents and host project files.
            </p>
          </div>
          <div className="mt-7 space-y-2.5">
            {DAEMON_INSTALLS.map((item) => (
              <div
                key={item.command}
                className="flex flex-col gap-1 rounded-xl bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.06] sm:flex-row sm:items-center sm:justify-between"
              >
                <code className="break-all font-mono text-[13px] text-slate-300">{item.command}</code>
                <span className="shrink-0 text-xs text-slate-600">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-600">
            Before deploying on a VPS, read the{" "}
            <a
              href="https://github.com/dvaJi/argos/blob/master/docs/guides/remote-machines.md"
              className="text-slate-400 underline decoration-white/10 underline-offset-4 transition-colors duration-300 hover:text-white"
            >
              remote machine guide
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
