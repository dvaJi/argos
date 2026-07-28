export type RemoteMachinePlatform = "macos" | "linux" | "windows";
export type RemoteMachineExposure = "loopback" | "private-network";

export type RemoteMachineCommandSet = {
  platform: RemoteMachinePlatform;
  available: boolean;
  unavailableReason?: string;
  install: string;
  start: Record<RemoteMachineExposure, string>;
  health: string;
  version: string;
  docsAnchor: string;
};

export const REMOTE_MACHINE_COMMANDS: readonly RemoteMachineCommandSet[] = [
  {
    platform: "macos",
    available: false,
    unavailableReason: "A standalone Argos Server binary for macOS is not published yet.",
    install: "",
    start: {
      loopback: "argos-daemon --host 127.0.0.1 --web --pair",
      "private-network": "argos-daemon --host 0.0.0.0 --web --pair",
    },
    health: "curl http://127.0.0.1:9527/health",
    version: "argos-daemon --version",
    docsAnchor: "#install-and-start-argos-server",
  },
  {
    platform: "linux",
    available: true,
    install:
      "curl -fsSL https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.sh | ARGOS_VERSION=v0.2.0 sh",
    start: {
      loopback: "argos-daemon --host 127.0.0.1 --web --pair",
      "private-network": "argos-daemon --host 0.0.0.0 --web --pair",
    },
    health: "curl http://127.0.0.1:9527/health",
    version: "argos-daemon --version",
    docsAnchor: "#install-and-start-argos-server",
  },
  {
    platform: "windows",
    available: true,
    install:
      "$env:ARGOS_VERSION='v0.2.0'; irm https://raw.githubusercontent.com/dvaJi/argos/v0.2.0/distro/install/install.ps1 | iex",
    start: {
      loopback: "argos-daemon.exe --host 127.0.0.1 --web --pair",
      "private-network": "argos-daemon.exe --host 0.0.0.0 --web --pair",
    },
    health: "irm http://127.0.0.1:9527/health",
    version: "argos-daemon.exe --version",
    docsAnchor: "#install-and-start-argos-server",
  },
] as const;

export function getRemoteMachineCommands(platform: RemoteMachinePlatform): RemoteMachineCommandSet {
  return REMOTE_MACHINE_COMMANDS.find((commands) => commands.platform === platform) ?? REMOTE_MACHINE_COMMANDS[1];
}
