import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";
import process from "node:process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const version = process.env.DAEMON_VERSION || pkg.version;

const outfile =
  process.env.ARGOS_TARGET_OS === "win32" || (!process.env.ARGOS_TARGET_OS && platform() === "win32")
    ? "dist/argos-daemon.exe"
    : "dist/argos-daemon";

const args = [
  "build",
  "--compile",
  "--define",
  `__DAEMON_VERSION__=${JSON.stringify(version)}`,
  "src/index.ts",
  "--outfile",
  outfile,
];

const result = spawnSync("bun", args, { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
