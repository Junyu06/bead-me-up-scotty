// Synthetic preview only: backdrop dismissal must reuse the draft-exit guard.
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
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  const panel = page.getByRole("dialog", {
    name: "demo-note-b 详情",
    exact: true,
  });
  const open = async () => {
    await page
      .getByRole("button", { name: /检查文章初稿的论点与例子/ })
      .click();
    await panel.waitFor();
  };
  const navBox = await page
    .locator("aside")
    .getByRole("button", { name: "Map", exact: true })
    .boundingBox();
  assert.ok(navBox);
  const outside = () =>
    page.mouse.click(navBox.x + navBox.width / 2, navBox.y + navBox.height / 2);
  await open();
  await outside();
  await panel.waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".view-projects").count(),
    1,
    "backdrop click must not activate navigation underneath",
  );
  await open();
  await panel
    .getByRole("heading", { name: "检查文章初稿的论点与例子" })
    .click();
  assert.equal(
    await panel.isVisible(),
    true,
    "inside clicks keep the detail open",
  );
  const heading = await panel
    .getByRole("heading", { name: "检查文章初稿的论点与例子" })
    .boundingBox();
  await page.mouse.move(heading.x + 10, heading.y + 10);
  await page.mouse.down();
  await page.mouse.move(100, 380, { steps: 5 });
  await page.mouse.up();
  assert.equal(
    await panel.isVisible(),
    true,
    "selecting text then releasing outside must not dismiss",
  );
  await panel.getByRole("button", { name: "编辑", exact: true }).click();
  const title = panel.getByRole("textbox", { name: "标题", exact: true });
  await title.fill("Unsaved example title");
  await outside();
  await panel.getByRole("button", { name: "继续编辑", exact: true }).waitFor();
  await panel.getByRole("button", { name: "继续编辑", exact: true }).click();
  assert.equal(await title.inputValue(), "Unsaved example title");
  await outside();
  await panel.getByRole("button", { name: "放弃草稿", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  await open();
  await panel.getByRole("button", { name: "要求修改", exact: true }).click();
  const response = panel.locator("textarea");
  await response.fill("Example changes to retain");
  await outside();
  await panel.getByRole("button", { name: "继续编辑", exact: true }).click();
  assert.equal(await response.inputValue(), "Example changes to retain");
  await outside();
  await panel.getByRole("button", { name: "放弃草稿", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  await open();
  await panel
    .getByRole("button", { name: "展开完整阅读页", exact: true })
    .click();
  await page.mouse.click(5, 5);
  await panel.waitFor({ state: "hidden" });
  await open();
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await open();
  await panel.getByRole("button", { name: "关闭详情", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: backdrop dismissal, no click-through, inside/drag protection, retained edit/response drafts, Escape and close button",
  );
} finally {
  await browser.close();
}
