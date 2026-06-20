import { spawnSync } from "node:child_process";
import process from "node:process";

const targetOS = process.env.ARGOS_TARGET_OS || process.platform;
const targetArch = process.env.ARGOS_TARGET_ARCH || process.arch;
const result = spawnSync(process.env.npm_execpath || "pnpm", ["turbo", "run", "build", "--filter=@argos/daemon"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ARGOS_TARGET_OS: targetOS,
    ARGOS_TARGET_ARCH: targetArch,
  },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
