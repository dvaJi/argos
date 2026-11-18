import type { Locator, Page } from "@playwright/test";

/**
 * Playwright input never moves the OS cursor and recorded videos contain no
 * pointer, so demo clicks would look like magic. This injects a fake cursor
 * that follows `mousemove` events and draws a ripple on `mousedown`.
 */
const installCursorOverlay = () => {
  const install = () => {
    if (document.getElementById("__demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo-cursor{position:fixed;top:0;left:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);transition:transform 40ms linear;
        background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M4 2l14 11-6.5 1 3.8 7.2-2.6 1.3-3.8-7.3L4 20z' fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/></svg>") no-repeat;
        filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}
      .__demo-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;z-index:2147483646;
        pointer-events:none;border:2px solid rgba(99,102,241,.9);background:rgba(99,102,241,.18);
        animation:__demo-ripple 450ms ease-out forwards;}
      @keyframes __demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__demo-cursor";
    document.body.appendChild(cursor);
    window.addEventListener(
      "mousemove",
      (e) => {
        cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
      },
      true,
    );
    window.addEventListener(
      "mousedown",
      (e) => {
        const ripple = document.createElement("div");
        ripple.className = "__demo-ripple";
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      },
      true,
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
};

export async function enableDemoCursor(page: Page): Promise<void> {
  await page.addInitScript(installCursorOverlay);
  await page.evaluate(installCursorOverlay);
  const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.move(viewport.w / 2, viewport.h / 2);
}

/** Glide the fake cursor to the element, pause briefly, then click it. */
export async function demoClick(page: Page, target: Locator, { pause = 350 } = {}): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) {
    await target.click();
    return;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await page.waitForTimeout(pause);
  await target.click();
}

export async function demoHover(page: Page, target: Locator, { pause = 600 } = {}): Promise<void> {
  const box = await target.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  }
  await page.waitForTimeout(pause);
}
