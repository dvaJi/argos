/**
 * Dev launcher: run the daemon from a cached single-file bundle.
 *
 * Running `bun run src/index.ts` opens ~1,250 source files. On Windows every
 * first open of a file is scanned by the antivirus (several ms each), so a
 * start after the scan cache has gone cold takes ~10s before the daemon can
 * even bind its port. A single bundled file is scanned once (~0.2s).
 *
 * The bundle lives in `node_modules/.cache` and is rebuilt whenever any input
 * (first-party or dependency) changes; freshness is checked with `stat` only,
 * which does not trigger a scan. Any failure falls back to running from source.
 *
 * Set ARGOS_DAEMON_DEV_BUNDLE=0 to always run from source.
 */
// bun-file-io-exception: synchronous stat/rename keeps the freshness check to a few ms at process start.
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Fingerprint = [mtimeMs: number, size: number];
type Manifest = { bunVersion: string; inputs: Record<string, Fingerprint> };

const sourceDir = import.meta.dir;
const daemonDir = resolve(sourceDir, "..");
const repoRoot = resolve(daemonDir, "..", "..");
const sourceEntry = join(sourceDir, "index.ts");
const workerEntry = join(sourceDir, "host", "piWorker.ts");
const cacheDir = join(daemonDir, "node_modules", ".cache", "argos-daemon-dev");
const bundleDir = join(cacheDir, "bundle");
const manifestPath = join(cacheDir, "manifest.json");
const bundleEntry = join(bundleDir, "index.js");
const bundleWorker = join(bundleDir, "piWorker.js");

/** Files that affect the bundle without being part of its module graph. */
const EXTRA_INPUTS = [
  join(sourceDir, "dev-bundle.ts"),
  join(daemonDir, "package.json"),
  join(daemonDir, "tsconfig.json"),
  join(repoRoot, "bun.lock"),
];

/** Native addons cannot be inlined; they resolve from node_modules at runtime. */
const EXTERNALS = ["sharp", "@duckdb/*", "*.node", "electron"];

function fingerprint(path: string): Fingerprint | null {
  try {
    const stats = statSync(path);
    return [stats.mtimeMs, stats.size];
  } catch {
    return null;
  }
}

async function isBundleFresh(): Promise<boolean> {
  if (!existsSync(bundleEntry) || !existsSync(bundleWorker)) return false;
  let manifest: Manifest;
  try {
    manifest = (await Bun.file(manifestPath).json()) as Manifest;
  } catch {
    return false;
  }
  if (manifest.bunVersion !== Bun.version) return false;
  for (const [path, expected] of Object.entries(manifest.inputs)) {
    const actual = fingerprint(path);
    if (!actual || actual[0] !== expected[0] || actual[1] !== expected[1]) return false;
  }
  return true;
}

async function buildBundle(): Promise<void> {
  const stagingDir = join(cacheDir, `staging-${process.pid}`);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  try {
    // Same define as the production build: once bundled, version.ts can no
    // longer find package.json relative to its own location.
    const pkg = (await Bun.file(join(daemonDir, "package.json")).json()) as { version?: string };
    const result = await Bun.build({
      entrypoints: [sourceEntry, workerEntry],
      outdir: stagingDir,
      naming: "[name].[ext]",
      target: "bun",
      format: "esm",
      sourcemap: "linked",
      metafile: true,
      external: EXTERNALS,
      define: { __DAEMON_VERSION__: JSON.stringify(pkg.version ?? "0.0.0-dev") },
    });
    if (!result.success || !result.metafile) {
      throw new Error(`bundle failed: ${result.logs.map(String).join("\n")}`);
    }

    const inputs: Record<string, Fingerprint> = {};
    for (const path of [...Object.keys(result.metafile.inputs).map((input) => resolve(input)), ...EXTRA_INPUTS]) {
      const value = fingerprint(path);
      if (value) inputs[path] = value;
    }

    // Drop the manifest first so an interrupted swap is seen as stale, not fresh.
    rmSync(manifestPath, { force: true });
    rmSync(bundleDir, { recursive: true, force: true });
    renameSync(stagingDir, bundleDir);
    await Bun.write(manifestPath, JSON.stringify({ bunVersion: Bun.version, inputs } satisfies Manifest));
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function ensureBundle(): Promise<string | null> {
  if (process.env.ARGOS_DAEMON_DEV_BUNDLE === "0") return null;
  const startedAt = performance.now();
  try {
    if (await isBundleFresh()) {
      console.log(`[daemon-dev] Using cached bundle (checked in ${Math.round(performance.now() - startedAt)}ms)`);
      return bundleEntry;
    }
    await buildBundle();
    console.log(`[daemon-dev] Rebuilt bundle in ${Math.round(performance.now() - startedAt)}ms`);
    return bundleEntry;
  } catch (error) {
    console.error("[daemon-dev] Bundle unavailable, running from source:", error);
    return null;
  }
}

type DaemonModule = { runDaemonCli: () => Promise<void> };

async function loadDaemon(): Promise<DaemonModule> {
  const bundle = await ensureBundle();
  if (bundle) {
    try {
      const loaded = (await import(pathToFileURL(bundle).href)) as DaemonModule;
      // The bundled daemon cannot find piWorker.ts next to itself; point it at the bundled worker.
      process.env.ARGOS_PI_WORKER_SCRIPT ??= bundleWorker;
      return loaded;
    } catch (error) {
      console.error("[daemon-dev] Bundle failed to load, running from source:", error);
    }
  }
  return (await import("./index")) as DaemonModule;
}

await (await loadDaemon()).runDaemonCli();
