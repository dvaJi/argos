// Best-effort validation of the distribution layer.
// - ruby -c on the Homebrew formula (skipped if ruby is absent)
// - shellcheck on install.sh (skipped if shellcheck is absent)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const checks = [
  {
    name: "formula ruby syntax",
    bin: "ruby",
    args: ["-c", "distro/homebrew/Formula/argos-daemon.rb"],
    required: false,
  },
  {
    name: "install.sh shellcheck",
    bin: "shellcheck",
    args: ["distro/install/install.sh"],
    required: false,
  },
];

let failed = false;

for (const c of checks) {
  if (!existsSync(c.args[c.args.length - 1])) {
    console.log(`skip  ${c.name} (file not found)`);
    continue;
  }
  if (Bun.which(c.bin) === null) {
    console.log(`skip  ${c.name} (${c.bin} not installed)`);
    continue;
  }
  const r = spawnSync(c.bin, c.args, { stdio: "inherit" });
  if (r.status === 0) {
    console.log(`ok    ${c.name}`);
  } else {
    console.error(`FAIL  ${c.name}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
