#!/usr/bin/env bun
/**
 * Sync release version metadata.
 *
 * The root `package.json` version is the single source of truth for a release.
 * electron-builder derives artifact names (`argos-<version>-<os>-<arch>.<ext>`),
 * the `latest*.yml` update manifests, and the app's `app.getVersion()` from
 * `apps/desktop/package.json`, so that version must match the release.
 *
 * Also verifies `CHANGELOG.md` has a `## vX.Y.Z (YYYY-MM-DD)` section for the
 * release version — the release workflow extracts notes from it.
 *
 * Usage:
 *   bun scripts/sync-release-version.mjs           # apply the root version + verify
 *   bun scripts/sync-release-version.mjs --check   # verify only (CI preflight); exit 1 on drift
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");

const checkOnly = process.argv.includes("--check");
const versionRegex = /^\d+\.\d+\.\d+(?:-(?:beta|alpha)\.\d+)?$/;
const changelogHeaderRegex = (version) =>
  new RegExp(`^##\\s+v${version.replaceAll(".", "\\.")}\\s*\\(\\d{4}-\\d{2}-\\d{2}\\)\\s*$`, "m");

const readJson = async (relativePath) => await Bun.file(path.join(repositoryRoot, relativePath)).json();

const fail = (message) => {
  console.error(`[release:sync-version] ${message}`);
  process.exit(1);
};

const rootPackage = await readJson("package.json");
const version = rootPackage.version;
if (!versionRegex.test(version)) {
  fail(`Root package.json has no valid release version: "${version}"`);
}

const changelog = await Bun.file(path.join(repositoryRoot, "CHANGELOG.md")).text();
if (!changelogHeaderRegex(version).test(changelog)) {
  fail(`CHANGELOG.md has no "## v${version} (YYYY-MM-DD)" section. Add the release notes before tagging.`);
}

const desktopPkgPath = "apps/desktop/package.json";
const desktopPackage = await readJson(desktopPkgPath);

if (desktopPackage.version === version) {
  console.log(`[release:sync-version] desktop version is in sync (v${version}).`);
  if (checkOnly) process.exit(0);
} else {
  if (checkOnly) {
    fail(
      `apps/desktop/package.json version (v${desktopPackage.version}) does not match the release version (v${version}). ` +
        `Run \`bun run release:sync-version\` on master and re-tag.`,
    );
  }
  const previousVersion = desktopPackage.version;
  desktopPackage.version = version;
  const serialized = `${JSON.stringify(desktopPackage, null, 2)}\n`;
  await Bun.write(path.join(repositoryRoot, desktopPkgPath), serialized);
  console.log(`[release:sync-version] apps/desktop version: v${previousVersion} -> v${version}`);
}

console.log(`[release:sync-version] OK (v${version}).`);
