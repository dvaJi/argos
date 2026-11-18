/**
 * Scripted product demo: "Command Code as a built-in ACP agent".
 *
 * Flow (one continuous screen recording of a pinned window):
 *   0. (optional, ARGOS_DEMO_SHOW_REGISTRY=1) Settings → ACP registry → Command Code
 *   1. New thread → pick Command Code in the agent switcher
 *   2. Open the model chip → search "deepseek" → pick it
 *   3. Pick a project from Recent Projects, type the prompt, send
 *   4. Live reply (sped up when rendering if long) → hold on the result
 *
 * Writes `raw.mp4` + `cutlist.json`; `bun run demo:render` trims, speeds up
 * the generation, and exports the final MP4/GIF.
 *
 * Run: `bun run build && bun run e2e:demo && bun run demo:render`
 * Uses your normal Argos profile (Command Code login lives in ~/.commandcode).
 * The sidebar is collapsed so personal threads stay off camera.
 * Don't touch the mouse/keyboard while it runs: the window is pinned on top
 * and the desktop rectangle under it is what gets recorded.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/electronApp";
import { waitForAppReady } from "../helpers/wait";
import { demoClick, demoHover, enableDemoCursor } from "./cursor";
import { computeStage, pinToStage, ScreenRecorder } from "./recorder";

const AGENT_ID = process.env.ARGOS_DEMO_AGENT_ID ?? "command-code";
/** Typed into the model search box. */
const MODEL_QUERY = process.env.ARGOS_DEMO_MODEL ?? "deepseek";
/** Row to pick among the search results (not every listed model works on every account). */
const MODEL_ROW = process.env.ARGOS_DEMO_MODEL_ROW ?? "DeepSeek V4.1 Flash";
const SHOW_REGISTRY = process.env.ARGOS_DEMO_SHOW_REGISTRY === "1";
/** Substring of the recent project to pick; defaults to the first one listed. */
const PROJECT_QUERY = process.env.ARGOS_DEMO_PROJECT;
// Read-only by default: the demo runs against one of your real projects.
const PROMPT =
  process.env.ARGOS_DEMO_PROMPT ??
  "Give me a quick tour of this project: what it does, its main folders, and how to run it. Don't modify any files.";
const [STAGE_W, STAGE_H] = (process.env.ARGOS_DEMO_SIZE ?? "1440x900").split("x").map(Number);
const OUTPUT_DIR = resolve(process.env.ARGOS_E2E_DEMO_OUTPUT_DIR ?? resolve(tmpdir(), "argos-demo"));

type Segment = { scene: string; file: string; start: number; end: number; maxSeconds?: number };

/** Click any "Allow" permission prompt Command Code raises while it works. */
const approvePermissionPrompts = async (page: Page) => {
  const allow = page.getByRole("button", { name: /^(allow|approve)/i }).first();
  if (await allow.isVisible().catch(() => false)) {
    await demoClick(page, allow, { pause: 600 });
  }
};

test("Command Code ACP demo", async ({ app }) => {
  const { electronApp, page } = app;
  const rawFile = resolve(OUTPUT_DIR, "raw.mp4");
  const segments: Segment[] = [];

  // ── Stage setup (off camera) ──────────────────────────────────────────────
  await waitForAppReady(page);
  const stage = await computeStage(electronApp, { width: STAGE_W || 1440, height: STAGE_H || 900 });
  await pinToStage(electronApp, page, stage);
  await enableDemoCursor(page);
  // Keep the app bar's "Install Update" pill off camera.
  await page.addStyleTag({
    content: ".window-drag-region > button.window-no-drag-region.rounded-full { visibility: hidden !important; }",
  });

  if (
    await page
      .getByTestId("window-sidebar-session-column")
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByTestId("window-sidebar-toggle").first().click();
    await expect(page.getByTestId("sidebar-rail")).toBeVisible();
  }

  const newChat = page.getByTestId("collapsed-new-chat-button");
  if (await newChat.isVisible().catch(() => false)) {
    await newChat.click();
  }
  await expect(page.getByTestId("new-thread-page")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const recorder = new ScreenRecorder(rawFile, stage);
  await recorder.start();

  try {
    // ── Scene 0 (optional): Command Code in the ACP registry ────────────────
    if (SHOW_REGISTRY) {
      const start = recorder.now();
      const opened = electronApp.waitForEvent("window");
      await demoClick(page, page.getByTestId("app-settings-button"));
      const settings = await opened;
      await expect(settings.getByTestId("settings-page")).toBeVisible({ timeout: 30_000 });
      await pinToStage(electronApp, settings, stage);
      await enableDemoCursor(settings);

      await demoClick(settings, settings.getByTestId("settings-tab-acp-agents"));
      await expect(settings.getByTestId("settings-acp-page")).toBeVisible();
      await demoClick(settings, settings.getByRole("button", { name: "Browse registry" }).first());
      const dialog = settings.getByRole("dialog");
      const search = dialog.getByPlaceholder("Search agents");
      await demoClick(settings, search);
      await search.pressSequentially("command", { delay: 90 });
      const row = dialog.locator(".divide-y > *").filter({ hasText: "Command Code" }).first();
      await expect(row, "Command Code is missing from the ACP registry — rebuild?").toBeVisible();
      await demoHover(settings, row.getByText("Command Code").first(), { pause: 1500 });
      const install = row.getByRole("button", { name: "Install" });
      if (await install.isVisible().catch(() => false)) {
        await demoClick(settings, install);
        await expect(install).toBeHidden({ timeout: 180_000 });
      }
      await settings.waitForTimeout(1200);
      await settings.close();
      await page.bringToFront();
      segments.push({ scene: "registry", file: rawFile, start, end: recorder.now() });
    }

    // ── Scene 1: pick Command Code ──────────────────────────────────────────
    const composeStart = recorder.now();
    await page.waitForTimeout(700);
    const switcher = page.locator("[data-test-variant][data-agent-id]").first();
    const agentOption = page.getByTestId(`agent-switcher-option-${AGENT_ID}`);
    // The menu occasionally ignores the first click while the page settles.
    for (let attempt = 0; attempt < 3; attempt++) {
      await demoClick(page, switcher);
      // `isVisible` never waits; `waitFor` does.
      if (
        await agentOption.waitFor({ state: "visible", timeout: 2_500 }).then(
          () => true,
          () => false,
        )
      )
        break;
      await page.keyboard.press("Escape");
    }
    if (!(await agentOption.isVisible().catch(() => false))) {
      await page.screenshot({ path: resolve(OUTPUT_DIR, "agent-menu-failure.png") });
      const ids = await page
        .locator('[data-testid^="agent-switcher-option-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      throw new Error(`Agent option for "${AGENT_ID}" not found. Available: ${ids.join(", ")}`);
    }
    await demoClick(page, agentOption);
    // The welcome switcher swaps to the topbar variant once an agent needs a project.
    await expect(page.locator(`[data-test-variant][data-agent-id="${AGENT_ID}"]`).first()).toBeVisible();

    // Pick a project from the Recent Projects list.
    await demoClick(page, page.getByTestId("new-thread-project-trigger"));
    const recentProjects = page
      .getByRole("menuitem")
      .filter({ hasNotText: /^(Open Folder|No project|Clear)/i })
      .filter(PROJECT_QUERY ? { hasText: PROJECT_QUERY } : {});
    await expect(recentProjects.first(), "No recent project to pick — open one in Argos first.").toBeVisible();
    await demoHover(page, recentProjects.first(), { pause: 500 });
    await demoClick(page, recentProjects.first());
    await expect(page.getByText("This agent needs a project")).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(600);

    // ── Scene 2: pick a model from the ACP model chip ───────────────────────
    // ACP option chips appear once Command Code has started (npx) for the project.
    const acpChips = page.locator("button.acp-inline-option").filter({ visible: true });
    await expect(acpChips.first(), "Command Code's option chips never appeared in the composer.").toBeVisible({
      timeout: 90_000,
    });
    const titledModel = page.locator('button.acp-inline-option[title*="model" i]').filter({ visible: true });
    const chip = (await titledModel.count()) > 0 ? titledModel.first() : acpChips.first();
    await expect(chip).toBeEnabled({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await demoClick(page, chip);

    // Only the open popover's search box (the regular model picker keeps a hidden one).
    const modelSearch = page
      .getByPlaceholder(/^Search /i)
      .filter({ visible: true })
      .first();
    if (
      await modelSearch.waitFor({ state: "visible", timeout: 3_000 }).then(
        () => true,
        () => false,
      )
    ) {
      await page.waitForTimeout(900); // let viewers see the lab-grouped list
      await modelSearch.pressSequentially(MODEL_QUERY, { delay: 110 });
    }
    const modelRow = page.locator('[role="option"]').filter({ hasText: MODEL_ROW }).first();
    await expect(modelRow, `No model "${MODEL_ROW}" in Command Code's list.`).toBeVisible();
    await demoHover(page, modelRow, { pause: 700 });
    await demoClick(page, modelRow);
    await expect(chip).toContainText(new RegExp(MODEL_QUERY, "i"), { timeout: 30_000 });
    await page.waitForTimeout(700);

    // ── Scene 3: prompt ─────────────────────────────────────────────────────
    const editor = page.getByTestId("chat-input-editor").locator('[contenteditable="true"]').first();
    await demoClick(page, editor);
    await editor.pressSequentially(PROMPT, { delay: 35 });
    await page.waitForTimeout(500);
    await demoClick(page, page.getByTestId("chat-send-button"));

    const chatPage = page.getByTestId("chat-page");
    await expect(chatPage).toHaveAttribute("data-generating", "true", { timeout: 60_000 });
    const generateStart = recorder.now() + 1;
    segments.push({ scene: "compose", file: rawFile, start: composeStart, end: generateStart });

    // ── Scene 4: live reply ─────────────────────────────────────────────────
    const deadline = Date.now() + 300_000;
    while ((await chatPage.getAttribute("data-generating")) === "true") {
      if (Date.now() > deadline) throw new Error("Command Code did not finish within 5 minutes.");
      await approvePermissionPrompts(page);
      await page.waitForTimeout(750);
    }
    const generateEnd = recorder.now();
    const reply = page.getByTestId("chat-message-assistant").last();
    await expect(reply, "Command Code replied with an error — not a usable take.").not.toContainText(
      /Request failed|Cause of error/i,
      { timeout: 1_000 },
    );
    segments.push({ scene: "generate", file: rawFile, start: generateStart, end: generateEnd, maxSeconds: 12 });

    await demoHover(page, page.getByTestId("chat-message-assistant").last(), { pause: 3500 });
    segments.push({ scene: "result", file: rawFile, start: generateEnd, end: recorder.now() });
  } finally {
    await recorder.stop();
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(
      resolve(OUTPUT_DIR, "cutlist.json"),
      JSON.stringify({ size: { width: stage.px.width, height: stage.px.height }, segments }, null, 2),
    );
  }
});
