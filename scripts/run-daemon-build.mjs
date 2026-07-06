import { spawnSync } from "node:child_process";
import process from "node:process";

const targetOS = process.env.ARGOS_TARGET_OS || process.platform;
const targetArch = process.env.ARGOS_TARGET_ARCH || process.arch;
const spawnOptions = {
  stdio: "inherit",
  env: {
    ...process.env,
    ARGOS_TARGET_OS: targetOS,
    ARGOS_TARGET_ARCH: targetArch,
  },
};
const result =
  process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", "pnpm turbo run build --filter=@argos/daemon"],
        spawnOptions,
      )
    : spawnSync("pnpm", ["turbo", "run", "build", "--filter=@argos/daemon"], spawnOptions);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
