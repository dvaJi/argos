import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));

const assertFile = async (label, relativePath) => {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  await access(absolutePath);
  console.log(`[packaging:validate] ${label}: ${relativePath}`);
};

const rootPackage = await readJson("package.json");
if (rootPackage.main !== "./apps/desktop/out/main/index.js") {
  throw new Error(`Unexpected root Electron entrypoint: ${rootPackage.main}`);
}

await assertFile("Electron entrypoint", rootPackage.main);

const configPath = path.join(repositoryRoot, "apps/desktop/electron-builder.yml");
const config = YAML.parse(await readFile(configPath, "utf8"));

await assertFile("NSIS include", config.nsis.include);
await assertFile("macOS entitlements", config.mac.entitlementsInherit);
await assertFile("afterPack hook", config.afterPack);
await assertFile("afterSign hook", config.afterSign);

const generatedResourceSources = new Set(["./runtime/", "./build/bundled-plugins/", "./apps/daemon/dist/"]);

for (const resource of config.extraResources ?? []) {
  if (generatedResourceSources.has(resource.from)) continue;
  await assertFile(`extra resource ${resource.to}`, resource.from);
}

console.log("[packaging:validate] packaging inputs are valid");
