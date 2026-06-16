import { spawn, exec as nodeExec } from "node:child_process";
import type { ISubprocessRunner } from "@argos/backend-core";
import { promisify } from "node:util";

const execAsync = promisify(nodeExec);

export class ElectronSubprocessRunner implements ISubprocessRunner {
  spawn(command: string, args: string[], options?: Record<string, unknown>): ReturnType<typeof spawn> {
    return spawn(command, args, options as Parameters<typeof spawn>[2]);
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execAsync(command);
      return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: err.stdout?.toString() ?? "",
        stderr: err.stderr?.toString() ?? "",
        exitCode: err.code ?? 1,
      };
    }
  }
}
