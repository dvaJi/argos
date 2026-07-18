// Rewrites the argos-daemon Homebrew formula with real release assets and
// pushes it to the dvaJi/homebrew-tap repo.
//
// Usage:
//   ARGOS_TAP_TOKEN=<token> bun run distro:bump-tap -- 0.1.0
//   DRY_RUN=1 bun run distro:bump-tap -- 0.1.0   # print formula, do not push
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const REPO = "dvaJi/argos";
const TAP_REPO = "dvaJi/homebrew-tap";
const FORMULA_REL = "Formula/argos-daemon.rb";

const TARGETS = [
  { platform: "darwin", arch: "intel", asset: "argos-daemon-darwin-x64" },
  { platform: "darwin", arch: "arm", asset: "argos-daemon-darwin-arm64" },
  { platform: "linux", arch: "intel", asset: "argos-daemon-linux-x64" },
  { platform: "linux", arch: "arm", asset: "argos-daemon-linux-arm64" },
];

export function generateFormula(version, hashes) {
  const tag = `v${version}`;
  const block = (a, asset) => {
    const h = hashes[asset];
    if (!h) throw new Error(`Missing sha256 for asset ${asset}`);
    return `    on_${a} do\n      url "https://github.com/${REPO}/releases/download/${tag}/${asset}"\n      sha256 "${h}"\n    end`;
  };

  const macos = TARGETS.filter((t) => t.platform === "darwin")
    .map((t) => block(t.arch, t.asset))
    .join("\n");
  const linux = TARGETS.filter((t) => t.platform === "linux")
    .map((t) => block(t.arch, t.asset))
    .join("\n");

  return `# Managed by scripts/bump-tap.mjs — do not edit by hand.
class ArgosDaemon < Formula
  desc "Argos headless backend server"
  homepage "https://github.com/${REPO}"
  version "${version}"
  license "Apache-2.0"

  on_macos do
${macos}
  end

  on_linux do
${linux}
  end

  def install
    bin.install File.basename(stable.url) => "argos-daemon"
  end

  test do
    assert_match version.to_s, shell_output("\#{bin}/argos-daemon --version")
  end
end
`;
}

async function fetchJson(url, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "argos-bump-tap" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function resolveHashes(tag, token) {
  const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, token);
  const byName = new Map(release.assets.map((a) => [a.name, a]));

  const hashes = {};
  for (const t of TARGETS) {
    const bin = byName.get(t.asset);
    if (!bin) {
      throw new Error(`Release ${tag} is missing asset ${t.asset}. Publish the release before bumping the tap.`);
    }
    const shaAsset = byName.get(`${t.asset}.sha256`);
    if (shaAsset) {
      const text = await (await fetch(shaAsset.browser_download_url)).text();
      hashes[t.asset] = text.trim().split(/\s+/)[0];
    } else {
      const buf = Buffer.from(await (await fetch(bin.browser_download_url)).arrayBuffer());
      hashes[t.asset] = createHash("sha256").update(buf).digest("hex");
    }
  }
  return hashes;
}

function pushToTap(formula, version, token) {
  const dir = join(tmpdir(), `homebrew-tap-${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  const authedUrl = `https://x-access-token:${token}@github.com/${TAP_REPO}`;

  const r1 = spawnSync("git", ["clone", "--depth", "1", authedUrl, dir], { stdio: "inherit" });
  if (r1.status !== 0) throw new Error("git clone failed");

  mkdirSync(join(dir, "Formula"), { recursive: true });
  writeFileSync(join(dir, FORMULA_REL), formula, "utf8");

  const run = (args) => {
    const r = spawnSync("git", ["-c", "user.name=argos-release-bot", "-c", "user.email=bot@argos", ...args], {
      cwd: dir,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  };
  run(["add", FORMULA_REL]);
  run(["commit", "-m", `argos-daemon ${version}`]);
  run(["push", "origin", "HEAD"]);
  rmSync(dir, { recursive: true, force: true });
}

async function main() {
  const version = process.argv[2]?.replace(/^v/, "");
  if (!version) {
    console.error("Usage: bump-tap.mjs <version>   (e.g. 0.1.0)");
    process.exit(1);
  }
  const token = process.env.ARGOS_TAP_TOKEN;
  const tag = `v${version}`;

  console.log(`> Resolving release assets for ${tag}...`);
  const hashes = await resolveHashes(tag, token);
  const formula = generateFormula(version, hashes);

  if (process.env.DRY_RUN) {
    process.stdout.write(formula);
    return;
  }
  if (!token) {
    console.error("ARGOS_TAP_TOKEN is required to push the tap (or set DRY_RUN=1).");
    process.exit(1);
  }

  console.log("> Pushing formula to dvaJi/homebrew-tap...");
  pushToTap(formula, version, token);
  console.log("Done. `brew install dvaJi/tap/argos-daemon` is now live.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
