import { RuntimeInjector } from "tiny-runtime-injector";

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const platform = flag("platform") || process.platform;
const arch = flag("arch") || process.arch;

const ripgrepVersion = platform === "win32" && arch === "arm64" ? "15.1.0" : "14.1.1";

const runtimes = [
  { type: "uv", version: "0.9.18", targetDir: "./runtime/uv" },
  { type: "ripgrep", version: ripgrepVersion, targetDir: "./runtime/ripgrep" },
];

for (const options of runtimes) {
  const label = `${options.type} ${options.version ?? "latest"}`;
  console.log(`[installRuntime] ${label} -> ${options.targetDir} (${platform}/${arch})`);
  await new RuntimeInjector({ ...options, platform, arch }).inject();
}
