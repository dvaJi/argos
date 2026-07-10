declare module "cross-spawn" {
  import type { ChildProcessWithoutNullStreams } from "node:child_process";

  const spawn: (
    command: string,
    args?: readonly string[],
    options?: Record<string, unknown>,
  ) => ChildProcessWithoutNullStreams;

  export default spawn;
}

declare module "node-pty" {
  export interface IPty {
    onData(listener: (data: string) => void): void;
    onExit(listener: (result: { exitCode: number; signal?: number | null }) => void): void;
    kill(signal?: string | number): void;
  }

  export function spawn(command: string, args: readonly string[], options: Record<string, unknown>): IPty;
}
