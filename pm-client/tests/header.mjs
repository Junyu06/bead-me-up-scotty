// Run against the synthetic PM preview, never a BD-backed server.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const base = process.env.PM_TEST_URL;
assert.ok(base, "Set PM_TEST_URL to the local PM preview");
const browser = await (
  process.env.PM_BROWSER === "webkit" ? webkit : chromium
).launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  const toggle = page.locator(".header-toggle");
  const expanded = async (value) => {
    await page.waitForFunction(
      (wanted) =>
        document
          .querySelector(".header-toggle")
          ?.getAttribute("aria-expanded") === String(wanted),
      value,
    );
    await page.waitForTimeout(350);
  };
  const down = async (locator = page.locator(".view-content")) => {
    const box = await locator.boundingBox();
    await page.mouse.move(
      box.x + box.width * 0.65,
      box.y + Math.min(120, box.height / 2),
    );
    await page.mouse.wheel(0, 180);
    await expanded(false);
  };
  const nav = (name) =>
    page.locator("aside").getByRole("button", { name, exact: true }).click();
  const tab = (name) =>
    page
      .locator(".view-tabs")
      .getByRole("button", { name, exact: true })
      .click();
  await nav("Board");
  await expanded(true);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const board = page.locator(".board-scroll");
  const before = (await board.boundingBox()).height;
  await page.screenshot({ path: "test-results/header-expanded.png" });
  await board.hover();
  await page.mouse.wheel(160, 0);
  await page.waitForTimeout(100);
  assert.equal(
    await toggle.getAttribute("aria-expanded"),
    "true",
    "horizontal scroll keeps controls open",
  );
  await down(board);
  const after = (await board.boundingBox()).height;
  assert.ok(after - before > 140, `board gains height: ${before} → ${after}`);
  assert.equal(
    await page.locator("#workspace-filters").getAttribute("inert"),
    "",
  );
  assert.equal(await page.locator(".view-tabs").isVisible(), true);
  await page.screenshot({ path: "test-results/header-collapsed.png" });
  await page.mouse.wheel(0, -180);
  await expanded(true);
  const search = page.getByRole("textbox", { name: "搜索标题或 ID" });
  await search.fill("demo");
  await board.hover();
  await page.mouse.wheel(0, 180);
  await page.waitForTimeout(350);
  assert.equal(
    await toggle.getAttribute("aria-expanded"),
    "true",
    "focused search stays visible",
  );
  await toggle.click();
  await expanded(false);
  assert.match(await toggle.innerText(), /筛选 1/);
  await toggle.press("Enter");
  await expanded(true);
  assert.equal(await search.inputValue(), "demo");
  await page.getByRole("button", { name: "清空搜索" }).click();
  await toggle.click();
  await expanded(false);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => !!document.activeElement.closest("[inert]")),
      false,
    );
  }
  await page
    .locator(".sidebar-projects")
    .getByRole("button", { name: "工作空间更新", exact: true })
    .click();
  await expanded(true);
  await down();
  await tab("Map");
  await expanded(true);
  const pane = page.locator(".react-flow__pane");
  const transform = () =>
    page.locator(".react-flow__viewport").getAttribute("style");
  const initialTransform = await transform();
  const mapBefore = (await pane.boundingBox()).height;
  await pane.dispatchEvent("wheel", {
    deltaY: -2,
    ctrlKey: true,
    bubbles: true,
    clientX: 700,
    clientY: 450,
  });
  await page.waitForTimeout(150);
  assert.notEqual(
    await transform(),
    initialTransform,
    "pinch still changes the map viewport",
  );
  assert.equal(
    await toggle.getAttribute("aria-expanded"),
    "true",
    "pinch does not collapse",
  );
  const beforePan = await transform();
  await down(pane);
  assert.notEqual(
    await transform(),
    beforePan,
    "vertical wheel still pans the map",
  );
  assert.ok(
    (await pane.boundingBox()).height > mapBefore + 140,
    "map gains canvas height",
  );
  const fitView = page.locator(".react-flow__controls-fitview");
  await fitView.click();
  await page.waitForTimeout(400);
  assert.ok((await page.locator(".react-flow__node").count()) > 0);
  await page.screenshot({ path: "test-results/map-collapsed.png" });
  await toggle.click();
  await expanded(true);
  await tab("Timeline");
  await expanded(true);
  await down();
  await page
    .locator(".sidebar-projects")
    .getByRole("button", { name: "阅读与写作", exact: true })
    .click();
  await expanded(true);
  await page
    .locator("aside")
    .getByRole("button", { name: /^Need Me/ })
    .click();
  await expanded(true);
  await down();
  await toggle.click();
  await expanded(true);
  await nav("Board");
  await expanded(true);
  await board.focus();
  await page.keyboard.press("PageDown");
  await expanded(false);
  await page.keyboard.press("Home");
  await expanded(true);
  await page.evaluate(() => {
    const key = "beads-pm:example-workspace-v1:view";
    const pref = JSON.parse(localStorage.getItem(key));
    pref.filters.owner = "obsolete-example-owner";
    localStorage.setItem(key, JSON.stringify(pref));
  });
  await page.reload();
  await expanded(true);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  assert.equal(await page.getByLabel("负责人筛选").inputValue(), "all");
  // The native app supports windows as small as 1000 × 650.
  await page.setViewportSize({ width: 1000, height: 650 });
  await nav("Map");
  await expanded(true);
  const controls = await page.locator(".react-flow__controls").boundingBox();
  assert.ok(
    controls.y + controls.height <= 650,
    "all Map controls fit the smallest window",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  assert.equal(
    await page
      .locator(".header-collapse")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: header interaction, filters, focus, view resets, map gestures, keyboard and reduced motion; board ${before} → ${after}px`,
  );
} finally {
  await browser.close();
}
