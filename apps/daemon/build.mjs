import { spawnSync } from "node:child_process";
import { readFileSync, cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import process from "node:process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const version = process.env.DAEMON_VERSION || pkg.version;

const isWin = process.env.ARGOS_TARGET_OS === "win32" || (!process.env.ARGOS_TARGET_OS && platform() === "win32");

const outfile = isWin ? "dist/argos-daemon.exe" : "dist/argos-daemon";
const workerOutfile = isWin ? "dist/argos-pi-worker.exe" : "dist/argos-pi-worker";
const distDir = dirname(outfile);

const worker = spawnSync("bun", ["build", "--compile", "src/host/piWorker.ts", "--outfile", workerOutfile], {
  stdio: "inherit",
});
if (worker.error) throw worker.error;
if (worker.status !== 0) {
  throw new Error("Failed to build the isolated Pi worker");
}

// Bundle the provider catalog (single source: the desktop built-in) next to the
// binary so the daemon can resolve provider-db models offline (e.g. DeepSeek).
const daemonDir = dirname(fileURLToPath(import.meta.url));
const modelDbSrc = join(daemonDir, "..", "desktop", "resources", "model-db", "providers.json");
if (existsSync(modelDbSrc)) {
  const modelDbDestDir = join(distDir, "model-db");
  mkdirSync(modelDbDestDir, { recursive: true });
  cpSync(modelDbSrc, join(modelDbDestDir, "providers.json"));
  console.log(`Bundled provider catalog -> ${join(modelDbDestDir, "providers.json")}`);
} else {
  console.warn(`[build] Provider catalog not found at ${modelDbSrc}; daemon will rely on remote fetch.`);
}

const args = [
  "build",
  "--compile",
  "--define",
  `__DAEMON_VERSION__=${JSON.stringify(version)}`,
  "--external",
  "@duckdb/node-api",
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
    "--external",
    "@duckdb/node-api",
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
