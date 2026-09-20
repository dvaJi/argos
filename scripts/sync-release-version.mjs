#!/usr/bin/env bun
/**
 * Sync release version metadata.
 *
 * The root `package.json` version is the single source of truth for a release.
 * electron-builder derives artifact names (`argos-<version>-<os>-<arch>.<ext>`),
 * the `latest*.yml` update manifests, and the app's `app.getVersion()` from
 * `apps/desktop/package.json`, so that version must match the release.
 * `apps/daemon/package.json` is synced too: the compiled standalone daemon
 * falls back to it for `--version` when `DAEMON_VERSION` is not set.
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

const daemonPkgPath = "apps/daemon/package.json";
const daemonPackage = await readJson(daemonPkgPath);

const targets = [
  { label: "desktop", path: desktopPkgPath, pkg: desktopPackage },
  { label: "daemon", path: daemonPkgPath, pkg: daemonPackage },
];

const outOfSync = targets.filter((target) => target.pkg.version !== version);

if (outOfSync.length === 0) {
  console.log(`[release:sync-version] desktop + daemon versions are in sync (v${version}).`);
  if (checkOnly) process.exit(0);
} else {
  if (checkOnly) {
    fail(
      `Package versions do not match the release version (v${version}): ` +
        outOfSync
          .map((target) => `${target.path} is v${target.pkg.version}`)
          .join(", ") +
        `. Run \`bun run release:sync-version\` on master and re-tag.`,
    );
  }
  for (const target of outOfSync) {
    const previousVersion = target.pkg.version;
    target.pkg.version = version;
    const serialized = `${JSON.stringify(target.pkg, null, 2)}\n`;
    await Bun.write(path.join(repositoryRoot, target.path), serialized);
    console.log(`[release:sync-version] ${target.path}: v${previousVersion} -> v${version}`);
  }
}

console.log(`[release:sync-version] OK (v${version}).`);
