import { spawnSync } from "node:child_process";
import { readFileSync, cpSync, mkdirSync, existsSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, platform } from "node:os";
import process from "node:process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const version = process.env.DAEMON_VERSION || pkg.version;

const targetOS = process.env.ARGOS_TARGET_OS || platform();
const targetArch = process.env.ARGOS_TARGET_ARCH || arch();
const isWin = targetOS === "win32";
const isNativeTarget = targetOS === platform() && targetArch === arch();

const duckDbBindings = [
  { os: "linux", arch: "x64", module: "@duckdb/node-bindings-linux-x64/duckdb.node" },
  { os: "linux", arch: "x64", module: "@duckdb/node-bindings-linux-x64-musl/duckdb.node" },
  { os: "linux", arch: "arm64", module: "@duckdb/node-bindings-linux-arm64/duckdb.node" },
  { os: "linux", arch: "arm64", module: "@duckdb/node-bindings-linux-arm64-musl/duckdb.node" },
  { os: "darwin", arch: "x64", module: "@duckdb/node-bindings-darwin-x64/duckdb.node" },
  { os: "darwin", arch: "arm64", module: "@duckdb/node-bindings-darwin-arm64/duckdb.node" },
  { os: "win32", arch: "x64", module: "@duckdb/node-bindings-win32-x64/duckdb.node" },
  { os: "win32", arch: "arm64", module: "@duckdb/node-bindings-win32-arm64/duckdb.node" },
];

const unsupportedDuckDbBindings = duckDbBindings
  .filter((binding) => binding.os !== targetOS || binding.arch !== targetArch)
  .flatMap((binding) => ["--external", binding.module]);

const outfile = isWin ? "dist/argos-daemon.exe" : "dist/argos-daemon";
const workerOutfile = isWin ? "dist/argos-pi-worker.exe" : "dist/argos-pi-worker";
const distDir = dirname(outfile);
const generatedEntry = ".compiled-entry.generated.ts";
const generatedDuckDbDll = ".duckdb.generated.dll";
const generatedDuckDbGlibc = ".duckdb.generated.glibc.so";
const generatedDuckDbMusl = ".duckdb.generated.musl.so";
const generatedDuckDbDylib = ".duckdb.generated.dylib";
const generatedWorker = isWin ? ".pi-worker.generated.exe" : ".pi-worker.generated";

const nodeApiEntry = fileURLToPath(import.meta.resolve("@duckdb/node-api"));
const duckDbScope = join(dirname(dirname(dirname(nodeApiEntry))), "node-bindings");
const duckDbBindingScope = dirname(realpathSync(duckDbScope));

const workerBootstrap = `import embeddedPiWorker from "./${generatedWorker}" with { type: "file" };
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workerDirectory = join(tmpdir(), "argos-pi-worker-${version}-${targetOS}-${targetArch}");
const workerExecutable = join(workerDirectory, "${isWin ? "argos-pi-worker.exe" : "argos-pi-worker"}");
mkdirSync(workerDirectory, { recursive: true });
if (!existsSync(workerExecutable)) {
  try {
    writeFileSync(workerExecutable, await Bun.file(embeddedPiWorker).bytes(), { flag: "wx", mode: 0o700 });
  } catch (error) {
    if (!existsSync(workerExecutable)) throw error;
  }
}
${isWin ? "" : "chmodSync(workerExecutable, 0o700);"}
process.env.ARGOS_PI_WORKER_PATH = workerExecutable;
if (process.argv.includes("--version")) {
  const workerCheck = spawnSync(workerExecutable, ["--version"], { windowsHide: true });
  if (workerCheck.error) throw workerCheck.error;
  if (workerCheck.status !== 0) throw new Error("Embedded Pi worker failed its startup check");
}
`;

const entrySource =
  targetOS === "win32"
    ? `${workerBootstrap}
import duckDbDll from "./${generatedDuckDbDll}" with { type: "file" };

const nativeDirectory = join(tmpdir(), "argos-duckdb-${pkg.dependencies["@duckdb/node-api"]}-${targetArch}");
const nativeDll = join(nativeDirectory, "duckdb.dll");
mkdirSync(nativeDirectory, { recursive: true });
if (!existsSync(nativeDll)) {
  try {
    writeFileSync(nativeDll, await Bun.file(duckDbDll).bytes(), { flag: "wx" });
  } catch (error) {
    if (!existsSync(nativeDll)) throw error;
  }
}
process.env.PATH = \`\${nativeDirectory};\${process.env.PATH || ""}\`;
const { runDaemonCli } = await import("./src/index.ts");
await runDaemonCli();
`
    : targetOS === "linux"
      ? `${workerBootstrap}
import glibcLibrary from "./${generatedDuckDbGlibc}" with { type: "file" };
import muslLibrary from "./${generatedDuckDbMusl}" with { type: "file" };
import { dlopen } from "bun:ffi";

const isMusl = !process.report?.getReport()?.header?.glibcVersionRuntime;
const embeddedLibrary = isMusl ? muslLibrary : glibcLibrary;
const nativeDirectory = join(
  tmpdir(),
  "argos-duckdb-${pkg.dependencies["@duckdb/node-api"]}-${targetArch}-" + (isMusl ? "musl" : "glibc"),
);
const nativeLibrary = join(nativeDirectory, "libduckdb.so");
mkdirSync(nativeDirectory, { recursive: true });
if (!existsSync(nativeLibrary)) {
  try {
    writeFileSync(nativeLibrary, await Bun.file(embeddedLibrary).bytes(), { flag: "wx", mode: 0o700 });
  } catch (error) {
    if (!existsSync(nativeLibrary)) throw error;
  }
}
const duckDbLibrary = dlopen(nativeLibrary, {
  duckdb_library_version: { args: [], returns: "ptr" },
});
const { runDaemonCli } = await import("./src/index.ts");
await runDaemonCli();
void duckDbLibrary;
`
      : targetOS === "darwin"
        ? `${workerBootstrap}
import embeddedLibrary from "./${generatedDuckDbDylib}" with { type: "file" };
import { dlopen } from "bun:ffi";

const nativeDirectory = join(tmpdir(), "argos-duckdb-${pkg.dependencies["@duckdb/node-api"]}-${targetArch}");
const nativeLibrary = join(nativeDirectory, "libduckdb.dylib");
mkdirSync(nativeDirectory, { recursive: true });
if (!existsSync(nativeLibrary)) {
  try {
    writeFileSync(nativeLibrary, await Bun.file(embeddedLibrary).bytes(), { flag: "wx", mode: 0o700 });
  } catch (error) {
    if (!existsSync(nativeLibrary)) throw error;
  }
}
const duckDbLibrary = dlopen(nativeLibrary, {
  duckdb_library_version: { args: [], returns: "ptr" },
});
const { runDaemonCli } = await import("./src/index.ts");
await runDaemonCli();
void duckDbLibrary;
`
        : `${workerBootstrap}\nconst { runDaemonCli } = await import("./src/index.ts");\nawait runDaemonCli();\n`;

if (targetOS === "win32") {
  cpSync(join(duckDbBindingScope, `node-bindings-win32-${targetArch}`, "duckdb.dll"), generatedDuckDbDll);
} else if (targetOS === "linux") {
  cpSync(join(duckDbBindingScope, `node-bindings-linux-${targetArch}`, "libduckdb.so"), generatedDuckDbGlibc);
  cpSync(join(duckDbBindingScope, `node-bindings-linux-${targetArch}-musl`, "libduckdb.so"), generatedDuckDbMusl);
} else if (targetOS === "darwin") {
  cpSync(join(duckDbBindingScope, `node-bindings-darwin-${targetArch}`, "libduckdb.dylib"), generatedDuckDbDylib);
}
writeFileSync(generatedEntry, entrySource);

const worker = spawnSync(
  "bun",
  [
    "build",
    "--compile",
    "--define",
    `__DAEMON_VERSION__=${JSON.stringify(version)}`,
    "src/host/piWorker.ts",
    "--outfile",
    workerOutfile,
  ],
  { stdio: "inherit" },
);
if (worker.error) throw worker.error;
if (worker.status !== 0) {
  throw new Error("Failed to build the isolated Pi worker");
}
cpSync(workerOutfile, generatedWorker);

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
  ...unsupportedDuckDbBindings,
  generatedEntry,
  "--outfile",
  outfile,
];

const result = spawnSync("bun", args, { stdio: "inherit" });
rmSync(generatedEntry, { force: true });
rmSync(generatedDuckDbDll, { force: true });
rmSync(generatedDuckDbGlibc, { force: true });
rmSync(generatedDuckDbMusl, { force: true });
rmSync(generatedDuckDbDylib, { force: true });
rmSync(generatedWorker, { force: true });
if (result.error) throw result.error;

if (result.status !== 0) {
  throw new Error(`Failed to build the self-contained Argos Server for ${targetOS}-${targetArch}`);
}

if (isNativeTarget) {
  const workerSmoke = spawnSync(join(process.cwd(), workerOutfile), ["--version"], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (workerSmoke.error) throw workerSmoke.error;
  if (workerSmoke.status !== 0) {
    throw new Error("Built embedded Pi worker failed its startup smoke check");
  }
  const smoke = spawnSync(join(process.cwd(), outfile), ["--version"], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (smoke.error) throw smoke.error;
  if (smoke.status !== 0) {
    throw new Error("Built Argos Server failed its startup smoke check");
  }
}
