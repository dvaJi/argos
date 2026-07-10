import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";
import process from "node:process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const version = process.env.DAEMON_VERSION || pkg.version;

const isWin = process.env.ARGOS_TARGET_OS === "win32" || (!process.env.ARGOS_TARGET_OS && platform() === "win32");

const outfile = isWin ? "dist/argos-daemon.exe" : "dist/argos-daemon";

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

if (result.status !== 0) {
  console.log("\nFalling back to transpile-only build (native modules not embeddable on this platform)...");
  const transpileArgs = [
    "build",
    "--target=bun",
    "--define",
    `__DAEMON_VERSION__=${JSON.stringify(version)}`,
    "src/index.ts",
    "--outfile",
    isWin ? "dist/argos-daemon.js" : "dist/argos-daemon.js",
  ];
  const transpile = spawnSync("bun", transpileArgs, { stdio: "inherit" });
  if (transpile.error) throw transpile.error;
  process.exitCode = transpile.status ?? 1;
} else {
  process.exitCode = 0;
}
