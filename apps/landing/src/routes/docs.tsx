import {
  ArrowSquareOut,
  CheckCircle,
  ClipboardText,
  Code,
  CopySimple,
  GithubLogo,
  HardDrives,
  Key,
  LockKey,
  Plug,
  ShieldCheck,
  TerminalWindow,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { Footer } from "~/components/Footer";
import { SiteHeader } from "~/components/SiteHeader";

const GITHUB_URL = "https://github.com/dvaJi/argos";
const RELEASES_URL = "https://github.com/dvaJi/argos/releases";
const ISSUES_URL = "https://github.com/dvaJi/argos/issues";
const INSTALL_RAW = "https://raw.githubusercontent.com/dvaJi/argos/main/distro/install";

const installCommands = [
  {
    title: "Homebrew",
    platform: "macOS / Linux",
    detail: "Best for machines already managed with Homebrew.",
    language: "bash",
    command: "brew install dvaJi/tap/argos-daemon",
  },
  {
    title: "Shell installer",
    platform: "macOS / Linux",
    detail: "Installs to ~/.argos/bin unless ARGOS_INSTALL_DIR is set.",
    language: "bash",
    command: `curl -fsSL ${INSTALL_RAW}/install.sh | sh`,
  },
  {
    title: "PowerShell installer",
    platform: "Windows",
    detail: "Installs to %USERPROFILE%\\.argos\\bin unless ARGOS_INSTALL_DIR is set.",
    language: "powershell",
    command: `irm ${INSTALL_RAW}/install.ps1 | iex`,
  },
] as const;

const runSteps = [
  {
    title: "Install the binary",
    text: "Use the installer that matches the host. The daemon ships as one standalone executable per platform.",
  },
  {
    title: "Start local first",
    text: "The default bind address is 127.0.0.1 on port 9527. Confirm health before wiring clients.",
  },
  {
    title: "Pair for remote access",
    text: "Use --pair to generate a one-time pairing URL for browser or mobile clients.",
  },
  {
    title: "Promote to a service",
    text: "For Linux servers, run it under systemd and restart the service after self-updates.",
  },
] as const;

const options = [
  ["--host <host>", "Bind address. Defaults to 127.0.0.1."],
  ["--port <port>", "Bind port. Defaults to 9527. Use 0 for an automatic port."],
  ["--data-dir <path>", "Store daemon data in a custom directory. Defaults to ~/.argos-daemon."],
  ["--web", "Serve the web UI. Requires --web-root or ARGOS_WEB_ROOT."],
  ["--web-root <path>", "Directory containing built web assets. Defaults to ./web."],
  ["--pair", "Generate a one-time pairing token and print the URL at startup."],
  ["--log-level <level>", "Use debug, info, warn, or error. Defaults to info."],
  ["--no-update-check", "Skip the startup update availability check."],
] as const;

const envVars = [
  ["ARGOS_HOST", "Same as --host."],
  ["ARGOS_PORT", "Same as --port."],
  ["ARGOS_DATA_DIR", "Same as --data-dir."],
  ["ARGOS_DESKTOP_BOOTSTRAP", "Desktop bootstrap secret (set by Electron main)."],
  ["ARGOS_WEB", "Same as --web (1/true)."],
  ["ARGOS_WEB_ROOT", "Same as --web-root."],
  ["ARGOS_LOG_LEVEL", "Same as --log-level."],
  ["ARGOS_NO_UPDATE_CHECK", "Same as --no-update-check."],
] as const;

const toc = [
  ["Start", "start"],
  ["Install", "install"],
  ["Run", "run"],
  ["Configure", "configure"],
  ["Update", "update"],
  ["Deploy", "deploy"],
  ["Debug", "debug"],
] as const;

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Argos Docs - Daemon setup and operation" },
      {
        name: "description",
        content:
          "Install, run, update, and configure the Argos daemon for headless AI agent workflows on Windows, macOS, and Linux.",
      },
    ],
  }),
});

function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-ink pt-28 text-slate-300">
        <section id="start" className="border-b border-white/[0.07] px-6 pb-10 pt-6">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
              <div>
                <Link
                  to="/"
                  className="text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-white"
                >
                  Argos home
                </Link>
                <p className="mt-6 text-sm font-medium text-accent">Daemon handbook</p>
                <h1 className="mt-3 max-w-4xl text-balance text-5xl font-semibold leading-tight text-white sm:text-6xl">
                  Run Argos as a headless control plane.
                </h1>
                <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-400">
                  Install the standalone daemon, expose the local route API, stream events over WebSocket, and keep a
                  server-side agent runtime updated without opening the desktop app.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href="#install"
                    className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    Install daemon
                    <TerminalWindow size={17} weight="bold" />
                  </a>
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors duration-200 hover:border-accent/40 hover:text-white"
                  >
                    View releases
                    <ArrowSquareOut size={17} weight="bold" />
                  </a>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 shadow-lg shadow-black/20">
                <div className="flex items-center gap-2 border-b border-white/[0.07] pb-3">
                  <span className="size-2 rounded-full bg-red-400" />
                  <span className="size-2 rounded-full bg-yellow-300" />
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span className="ml-2 font-mono text-xs text-slate-500">argos-daemon</span>
                </div>
                <div className="mt-4 space-y-3 font-mono text-sm leading-6">
                  <p className="text-slate-500">$ argos-daemon</p>
                  <p className="text-slate-300">[daemon] Listening on http://127.0.0.1:9527</p>
                  <p className="text-slate-300">[daemon] Health: http://127.0.0.1:9527/health</p>
                  <p className="text-slate-300">[daemon] Routes: POST /api/v1/route</p>
                  <p className="text-slate-300">[daemon] Events: ws://127.0.0.1:9527/api/v1/events</p>
                </div>
              </div>
            </div>

            <nav className="mt-10 flex gap-2 overflow-x-auto border-t border-white/[0.07] pt-4 lg:hidden">
              {toc.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="shrink-0 rounded-md border border-white/[0.08] px-3 py-2 text-sm text-slate-400"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-28 space-y-1 text-sm">
              {toc.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block rounded-md px-3 py-2 text-slate-500 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white"
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-20">
            <DocsSection eyebrow="01" id="install" title="Install the daemon">
              <p>
                Pick the install path that matches how you manage the host. Each installer resolves the matching GitHub
                Release asset, verifies the checksum, and places the binary in your user install directory.
              </p>
              <div className="grid gap-4 xl:grid-cols-3">
                {installCommands.map((item) => (
                  <CommandCard key={item.title} {...item} />
                ))}
              </div>
              <Callout icon={ClipboardText} title="Pin a release when reproducibility matters">
                Use <code>ARGOS_VERSION=v0.1.0</code> before the shell installer or
                <code>$env:ARGOS_VERSION="v0.1.0"</code> before the PowerShell installer.
              </Callout>
            </DocsSection>

            <DocsSection eyebrow="02" id="run" title="Start local, then open access deliberately">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <CommandBlock command="argos-daemon" language="bash" />
                  <CommandBlock command="curl http://127.0.0.1:9527/health" language="bash" />
                  <p>
                    The health endpoint returns <code>status</code>, <code>version</code>, and <code>uptime</code>. Keep
                    the default localhost bind while testing clients. Use <code>--pair</code> to generate a one-time URL
                    for browser access.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <ProtocolCard icon={Code} title="Route API" text="POST /api/v1/route" />
                  <ProtocolCard icon={Plug} title="Event stream" text="ws://host:port/api/v1/events" />
                  <ProtocolCard icon={HardDrives} title="Data directory" text="~/.argos-daemon" />
                </div>
              </div>
            </DocsSection>

            <DocsSection eyebrow="03" id="configure" title="Configure runtime settings">
              <p>
                Flags are best for one-off runs. Environment variables are better for services, containers, and remote
                machines where config should live outside the process command.
              </p>
              <div className="grid gap-6 xl:grid-cols-2">
                <ReferencePanel title="CLI flags" rows={options} />
                <ReferencePanel title="Environment" rows={envVars} />
              </div>
              <Callout icon={LockKey} title="Remote access">
                Non-loopback requests require an authenticated session. Use <code>--pair</code> to generate a one-time
                pairing URL, or set <code>ARGOS_DESKTOP_BOOTSTRAP</code> for desktop-managed access.
              </Callout>
            </DocsSection>

            <DocsSection eyebrow="04" id="update" title="Keep it current">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-4">
                  <CommandBlock command="argos-daemon update" language="bash" />
                  <CommandBlock command="sudo systemctl restart argos-daemon" language="bash" />
                  <p>
                    The update command downloads, verifies, and atomically swaps the installed binary. The daemon also
                    checks GitHub Releases on startup and logs when a newer version is available.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
                  <h3 className="font-semibold text-white">Disable update checks</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Use this on locked-down hosts or environments that block GitHub API calls.
                  </p>
                  <div className="mt-4 space-y-2 font-mono text-sm text-slate-300">
                    <p>--no-update-check</p>
                    <p>ARGOS_NO_UPDATE_CHECK=1</p>
                  </div>
                </div>
              </div>
            </DocsSection>

            <DocsSection eyebrow="05" id="deploy" title="Promote it to a service">
              <p>
                Linux servers can use the reference unit at <code>distro/systemd/argos-daemon.service</code>. Copy it,
                adjust the user, binary path, data directory, and environment, then enable the service.
              </p>
              <CommandBlock
                command={[
                  "sudo install -m 0755 argos-daemon /usr/local/bin/argos-daemon",
                  "sudo install -m 0644 distro/systemd/argos-daemon.service /etc/systemd/system/",
                  "sudo systemctl daemon-reload",
                  "sudo systemctl enable --now argos-daemon",
                ].join("\n")}
                language="bash"
              />
              <div className="grid gap-3 sm:grid-cols-4">
                {runSteps.map((step, index) => (
                  <StepItem key={step.title} index={index + 1} title={step.title} text={step.text} />
                ))}
              </div>
            </DocsSection>

            <DocsSection eyebrow="06" id="debug" title="Debug the obvious things first">
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckItem text="Run `argos-daemon --version` to confirm the installed binary." />
                <CheckItem text="Run `argos-daemon --help` to inspect supported flags." />
                <CheckItem text="Check `/health` before debugging route or event clients." />
                <CheckItem text="Use `ARGOS_LOG_LEVEL=debug` for more detailed logs." />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <ExternalLink href={RELEASES_URL} label="Releases" />
                <ExternalLink href={ISSUES_URL} label="Issues" />
                <ExternalLink href={GITHUB_URL} label="Source" icon={GithubLogo} />
              </div>
            </DocsSection>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}

function DocsSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-6">
      <div className="grid gap-3 border-b border-white/[0.07] pb-4 sm:grid-cols-[72px_1fr]">
        <p className="font-mono text-sm text-accent">{eyebrow}</p>
        <h2 className="text-balance text-3xl font-semibold leading-tight text-white sm:text-4xl">{title}</h2>
      </div>
      <div className="space-y-5 text-pretty text-base leading-7 text-slate-400">{children}</div>
    </section>
  );
}

function CommandCard({
  title,
  platform,
  detail,
  command,
  language,
}: {
  title: string;
  platform: string;
  detail: string;
  command: string;
  language: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
      <p className="text-xs font-medium text-accent">{platform}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{detail}</p>
      <CommandBlock command={command} language={language} compact />
    </div>
  );
}

function CommandBlock({
  command,
  language,
  compact = false,
}: {
  command: string;
  language: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className={compact ? "mt-4" : "mt-0"}>
      <div className="flex items-center justify-between rounded-t-lg border border-white/[0.08] border-b-0 bg-white/[0.035] px-3 py-2">
        <span className="font-mono text-xs text-slate-500">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
          aria-label="Copy command"
        >
          <CopySimple size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border border-white/[0.08] bg-black/35 p-4 text-sm leading-6 text-slate-200">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function ProtocolCard({ icon: IconComponent, title, text }: { icon: Icon; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <IconComponent size={22} className="text-accent" />
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 break-all font-mono text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function ReferencePanel({ title, rows }: { title: string; rows: readonly (readonly [string, string])[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08]">
      <h3 className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm font-semibold text-white">
        {title}
      </h3>
      {rows.map(([name, detail]) => (
        <div
          key={name}
          className="grid gap-2 border-b border-white/[0.06] p-4 last:border-b-0 sm:grid-cols-[190px_1fr]"
        >
          <code className="font-mono text-sm text-slate-200">{name}</code>
          <p className="text-sm leading-6 text-slate-500">{detail}</p>
        </div>
      ))}
    </div>
  );
}

function Callout({ icon: IconComponent, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-5">
      <div className="flex gap-3">
        <IconComponent size={22} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{children}</p>
        </div>
      </div>
    </div>
  );
}

function StepItem({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="font-mono text-sm text-accent">{String(index).padStart(2, "0")}</p>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-accent" />
      <p className="text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function ExternalLink({
  href,
  label,
  icon: IconComponent = ArrowSquareOut,
}: {
  href: string;
  label: string;
  icon?: Icon;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] px-4 py-2 text-sm font-medium text-slate-300 transition-colors duration-200 hover:border-accent/40 hover:text-white"
    >
      {label}
      <IconComponent size={16} weight="bold" />
    </a>
  );
}
