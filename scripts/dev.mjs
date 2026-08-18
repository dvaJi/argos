import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uiUrl = "http://127.0.0.1:5180";
const environment = { ...process.env, ARGOS_UI_DEV_SERVER_URL: uiUrl };
const children = [];
let shuttingDown = false;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeExecutable = process.env.NODE_BINARY?.trim() || "node";

function startVite(workspace) {
  const workspaceDir = resolve(repoRoot, workspace);
  const viteCli = resolve(workspaceDir, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(nodeExecutable, [viteCli], { cwd: workspaceDir, env: environment, stdio: "inherit" });

  children.push(child);
  child.on("error", (error) => {
    console.error("Failed to start a development process:", error);
    shutdown(1);
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }

  process.exitCode = exitCode;
}

async function waitForUiServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(uiUrl);
      if (response.ok) return;
    } catch {
      // Vite has not started listening yet.
    }
    await Bun.sleep(250);
  }
  throw new Error(`The UI dev server did not become ready at ${uiUrl} within 30 seconds.`);
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

console.log(`[dev] Starting UI Vite server at ${uiUrl}...`);
const ui = startVite("packages/ui");
ui.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

try {
  await waitForUiServer();
} catch (error) {
  console.error(error);
  shutdown(1);
  process.exit();
}

console.log("[dev] UI ready. Starting desktop shell...");
const desktop = startVite("apps/desktop");
desktop.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});
