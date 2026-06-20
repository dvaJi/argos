import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const storePath = execSync("pnpm store path --silent", {
  encoding: "utf8",
  shell: true,
}).trim();

if (!storePath) throw new Error("pnpm did not report a store path");
mkdirSync(storePath, { recursive: true });
console.log(`[setup-build] pnpm store ready: ${storePath}`);
